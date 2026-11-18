import { randomUUID } from 'node:crypto';
import { sha256 } from './objects.ts';

export class UploadConflict extends Error {}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const normalize = row => row ? { ...row, bytes: Number(row.bytes), created: Number(row.created) } : null;

export class PostgresRecordings {
  private database;
  private objects;
  constructor(database, objects) { this.database = database; this.objects = objects; }

  async create(tenant, data) {
    if (!data || !['title','course','unit'].every(key => typeof data[key] === 'string' && data[key].trim() && data[key].length <= 160) ||
      typeof data.mime !== 'string' || data.mime.length > 255 || !/^(video|audio)\/(webm|mp4|ogg)(;.*)?$/.test(data.mime) ||
      (data.uploadId !== undefined && !uuid.test(data.uploadId))) throw new Error('Metadados inválidos.');
    const id = data.uploadId ?? randomUUID();
    return this.database.transaction(tenant, async connection => {
      const inserted = await connection.query(`INSERT INTO recordings(id,tenant,title,course,unit,mime,created)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING RETURNING id`,
        [id,tenant,data.title.trim(),data.course.trim(),data.unit.trim(),data.mime,Date.now()]);
      const row = (await connection.query('SELECT * FROM recordings WHERE id=$1', [id])).rows[0];
      if (!row || !['title','course','unit'].every(key => row[key] === data[key].trim()) || row.mime !== data.mime) {
        throw new UploadConflict('Identificador de upload em conflito.');
      }
      return { id, created: Boolean(inserted.rowCount) };
    });
  }

  async list(tenant) {
    return this.database.transaction(tenant, async connection =>
      (await connection.query('SELECT id,title,course,unit,mime,state,bytes,created,next_chunk FROM recordings ORDER BY created DESC,id')).rows.map(normalize));
  }

  async find(tenant, id) {
    return this.database.transaction(tenant, async connection =>
      normalize((await connection.query('SELECT * FROM recordings WHERE id=$1', [id])).rows[0]));
  }

  async putPart(tenant, id, number, data) {
    if (!Number.isSafeInteger(number) || number < 0 || number > 2147483646 ||
      !Buffer.isBuffer(data) || !data.length || data.length > 8 * 1024 * 1024) throw new Error('Parte inválida.');
    const digest = sha256(data);
    return this.database.transaction(tenant, async connection => {
      // Serialize object confirmation, next part and completion for this recording.
      const row = normalize((await connection.query('SELECT * FROM recordings WHERE id=$1 FOR UPDATE', [id])).rows[0]);
      if (!row) return null;
      if (row.state !== 'uploading') throw new UploadConflict('Upload já encerrado.');
      if (number < row.next_chunk) {
        const previous = (await connection.query('SELECT bytes,digest FROM media_parts WHERE recording_id=$1 AND number=$2', [id,number])).rows[0];
        if (!previous || previous.bytes !== data.length || previous.digest !== digest) throw new UploadConflict('Parte repetida divergente.');
        return { saved: true };
      }
      if (number !== row.next_chunk || row.bytes + data.length > 1024 * 1024 * 1024) throw new UploadConflict('Sequência ou limite de upload inválido.');
      const key = `${tenant}/recordings/${id}/${number}-${digest}`;
      // Confirm a durable immutable object before its metadata. A failed DB commit may leave an
      // unreferenced object; never delete it here because a retry may already have referenced it.
      await this.objects.put(key, data, digest);
      await connection.query('INSERT INTO media_parts(tenant,recording_id,number,bytes,digest,object_key) VALUES($1,$2,$3,$4,$5,$6)',
        [tenant,id,number,data.length,digest,key]);
      await connection.query('UPDATE recordings SET next_chunk=next_chunk+1,bytes=bytes+$1 WHERE id=$2', [data.length,id]);
      return { saved: true };
    });
  }

  async complete(tenant, id, expected) {
    if (!expected || !Number.isSafeInteger(expected.bytes) || !Number.isSafeInteger(expected.chunks) ||
      expected.bytes <= 0 || expected.chunks <= 0) throw new Error('Confirme os contadores do upload.');
    return this.database.transaction(tenant, async connection => {
      const row = normalize((await connection.query('SELECT * FROM recordings WHERE id=$1 FOR UPDATE', [id])).rows[0]);
      if (!row) return null;
      const totals = (await connection.query(`SELECT COUNT(*) AS count,COALESCE(SUM(bytes),0) AS bytes,
        MIN(number) AS first,MAX(number) AS last FROM media_parts WHERE recording_id=$1`, [id])).rows[0];
      if (!['uploading','ready'].includes(row.state) || row.bytes !== expected.bytes || row.next_chunk !== expected.chunks ||
        Number(totals.count) !== row.next_chunk || Number(totals.bytes) !== row.bytes || totals.first !== 0 || totals.last !== row.next_chunk-1) {
        throw new UploadConflict('Upload incompleto ou contadores divergentes.');
      }
      await connection.query("UPDATE recordings SET state='ready' WHERE id=$1", [id]);
      return { ready: true };
    });
  }

  // Caller authorizes the producer/student before obtaining media. RLS also enforces tenant.
  async manifest(tenant, id) {
    return this.database.transaction(tenant, async connection => {
      const row = normalize((await connection.query("SELECT * FROM recordings WHERE id=$1 AND state='ready'", [id])).rows[0]);
      if (!row) return null;
      const parts = (await connection.query('SELECT number,bytes,digest,object_key FROM media_parts WHERE recording_id=$1 ORDER BY number', [id])).rows;
      if (parts.length !== row.next_chunk || parts.reduce((sum,part) => sum+part.bytes,0) !== row.bytes || parts.some((part,index) => part.number !== index)) {
        throw new Error('Manifesto de mídia inconsistente.');
      }
      return { ...row, parts };
    }, 'REPEATABLE READ');
  }

  async *readRange(tenant, id, start = 0, end = undefined) {
    const manifest = await this.manifest(tenant,id);
    if (!manifest) throw new Error('Mídia indisponível.');
    end ??= manifest.bytes-1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= manifest.bytes) throw new Error('Intervalo inválido.');
    let offset = 0;
    for (const part of manifest.parts) {
      if (offset > end) break;
      if (offset + part.bytes > start) {
        const data = await this.objects.get(part.object_key);
        if (data.length !== part.bytes || sha256(data) !== part.digest) throw new Error('Integridade da mídia inválida.');
        yield data.subarray(Math.max(0,start-offset),Math.min(data.length,end-offset+1));
      }
      offset += part.bytes;
    }
  }
}
