import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgresDatabase } from '../../persistence/postgres.ts';
import { PostgresRecordings, UploadConflict } from '../../persistence/recordings.ts';
import { FileObjects, R2Objects, sha256 } from '../../persistence/objects.ts';

test('upload PostgreSQL confirma objetos privados, retoma sem duplicar e verifica integridade', async t => {
  assert(process.env.DATABASE_URL);
  const database = new PostgresDatabase(process.env.DATABASE_URL);
  const directory = await mkdtemp(join(tmpdir(),'academy-pg-objects-'));
  const realR2 = process.env.ACADEMY_TEST_R2 === '1';
  const backing = realR2 ? new R2Objects({
    endpoint:process.env.R2_ENDPOINT, bucket:process.env.R2_BUCKET,
    accessKeyId:process.env.R2_ACCESS_KEY_ID, secretAccessKey:process.env.R2_SECRET_ACCESS_KEY
  }) : new FileObjects(directory);
  const keys = new Set();
  let failPut = false, failAfterPut = false, corruptRead = false, readCount = 0;
  const objects = {
    async put(key,data,digest) {
      if (failPut) { failPut=false; throw new Error('Object storage unavailable'); }
      keys.add(key);
      await backing.put(key,data,digest);
      if (failAfterPut) { failAfterPut=false; throw new Error('Response lost after durable write'); }
    },
    async get(key) { readCount++; return corruptRead ? Buffer.from('corrupt') : backing.get(key); }
  };
  const recordings = new PostgresRecordings(database,objects);
  const tenants = ['media-a-'+randomUUID(),'media-b-'+randomUUID()];
  t.after(async () => {
    try {
      for (const key of keys) await backing.delete(key);
    } finally {
      try {
        for (const tenant of tenants) await database.transaction(tenant,async connection => {
          for (const table of ['media_parts','recordings','academies']) await connection.query('DELETE FROM '+table);
        });
      } finally {
        await database.close();
        backing.close?.();
        await rm(directory,{recursive:true,force:true});
      }
    }
  });
  for (const tenant of tenants) await database.transaction(tenant,connection => connection.query('INSERT INTO academies(id,name) VALUES($1,$2)',[tenant,tenant]));
  const data = {title:'Aula',course:'Curso',unit:'Módulo',mime:'video/webm',uploadId:randomUUID()};
  const created = await Promise.all(Array.from({length:3},() => recordings.create(tenants[0],data)));
  assert.equal(created.filter(row => row.created).length,1);
  const id = created[0].id;
  await assert.rejects(recordings.create(tenants[0],{...data,title:'Diferente'}),UploadConflict);
  await assert.rejects(recordings.create(tenants[1],data),UploadConflict);
  assert.equal(await recordings.find(tenants[1],id),null);
  assert.deepEqual(await recordings.list(tenants[1]),[]);
  assert.equal(await recordings.manifest(tenants[0],id),null);
  assert.equal(await recordings.putPart(tenants[1],id,0,Buffer.from('secret')),null);
  assert.equal(keys.size,0);
  const parts = [Buffer.from('primeira-'),Buffer.from('segunda-'),Buffer.from('final')];
  await assert.rejects(recordings.putPart(tenants[0],id,1,parts[1]),UploadConflict);
  failPut = true;
  await assert.rejects(recordings.putPart(tenants[0],id,0,parts[0]),/unavailable/);
  assert.equal((await recordings.find(tenants[0],id)).next_chunk,0);
  failAfterPut = true;
  await assert.rejects(recordings.putPart(tenants[0],id,0,parts[0]),/lost/);
  assert.equal(keys.size,1);
  assert.equal((await recordings.find(tenants[0],id)).bytes,0);
  await Promise.all(Array.from({length:3},() => recordings.putPart(tenants[0],id,0,parts[0])));
  assert.equal(keys.size,1);
  assert.equal((await recordings.find(tenants[0],id)).next_chunk,1);
  await assert.rejects(recordings.putPart(tenants[0],id,0,Buffer.from('diferente')),UploadConflict);
  await assert.rejects(recordings.complete(tenants[0],id,{bytes:900,chunks:3}),UploadConflict);
  assert.equal((await recordings.find(tenants[0],id)).state,'uploading');
  await recordings.putPart(tenants[0],id,1,parts[1]);
  await recordings.putPart(tenants[0],id,2,parts[2]);
  const content = Buffer.concat(parts);
  const expected = {bytes:content.length,chunks:3};
  await recordings.complete(tenants[0],id,expected);
  await recordings.complete(tenants[0],id,expected);
  assert.equal(await recordings.complete(tenants[1],id,expected),null);
  await assert.rejects(recordings.putPart(tenants[0],id,3,Buffer.from('extra')),UploadConflict);
  const resumed = new PostgresRecordings(database,objects);
  const manifest = await resumed.manifest(tenants[0],id);
  assert.equal(manifest.bytes,content.length);
  assert.equal(manifest.parts.length,3);
  assert(manifest.parts.every(part => part.object_key.startsWith(tenants[0]+'/') && /^[a-f0-9]{64}$/.test(part.digest)));
  async function read(tenant,start,end) {
    const buffers=[];
    for await (const part of resumed.readRange(tenant,id,start,end)) buffers.push(part);
    return Buffer.concat(buffers);
  }
  assert.deepEqual(await read(tenants[0]),content);
  assert.deepEqual(await read(tenants[0],3,14),content.subarray(3,15));
  readCount=0;
  assert.deepEqual(await read(tenants[0],0,2),content.subarray(0,3));
  assert.equal(readCount,1);
  await assert.rejects(read(tenants[1]),/indisponível/);
  await assert.rejects(read(tenants[0],0,content.length),/Intervalo/);
  corruptRead=true;
  await assert.rejects(read(tenants[0]),/Integridade/);
  corruptRead=false;
  // Exercise conditional PUT against the real R2 service as well as the filesystem adapter.
  const key=manifest.parts[0].object_key;
  await backing.put(key,parts[0],sha256(parts[0]));
  const different=Buffer.from('replacement');
  await assert.rejects(backing.put(key,different,sha256(different)),/divergente/);
  assert.deepEqual(await backing.get(key),parts[0]);
  assert.equal((await recordings.list(tenants[0])).length,1);
  await assert.rejects(recordings.putPart(tenants[0],id,0,Buffer.alloc(0)),/inválida/);
  if (realR2) t.diagnostic('Verified actual R2 PUT, conditional retries, GET, integrity and DELETE with PostgreSQL on applications.');
});
