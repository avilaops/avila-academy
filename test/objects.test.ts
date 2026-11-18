import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileObjects, R2Objects, sha256 } from '../persistence/objects.ts';

test('objetos locais são privados, imutáveis e impedem travessia de diretório', async t => {
  const directory = await mkdtemp(join(tmpdir(),'academy-objects-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  const objects = new FileObjects(directory);
  const key = 'academy-a/recordings/test/0-abc';
  const data = Buffer.from('conteúdo privado');
  await Promise.all(Array.from({length:3},() => objects.put(key,data,sha256(data))));
  assert.deepEqual(await objects.get(key),data);
  assert.equal((await stat(join(directory,key))).mode & 0o777,0o600);
  const other = Buffer.from('outro');
  await assert.rejects(objects.put(key,other,sha256(other)),/divergente/);
  assert.deepEqual(await objects.get(key),data);
  await assert.rejects(objects.put('academy-a/new',data,'0'.repeat(64)),/hash/);
  for (const bad of ['../secrets','academy-a/../secrets','/academy-a/object','academy-a//file','academy-a/%2e%2e/file']) {
    await assert.rejects(objects.get(bad),/Chave/);
    await assert.rejects(objects.delete(bad),/Chave/);
  }
  await objects.delete(key);
  await assert.rejects(objects.get(key),{code:'ENOENT'});
});

test('R2 recusa configuração incompleta ou endpoint externo antes de enviar credenciais', () => {
  for (const endpoint of ['http://localhost','https://example.com','https://user:pass@'+'a'.repeat(32)+'.r2.cloudflarestorage.com']) {
    assert.throws(() => new R2Objects({endpoint,bucket:'academy',accessKeyId:'test',secretAccessKey:'test'}));
  }
});
