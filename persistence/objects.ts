import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, link, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export const sha256 = data => createHash('sha256').update(data).digest('hex');

function validKey(key) {
  if (typeof key !== 'string' || key.length > 512 ||
    !/^[a-z0-9][a-z0-9-]{1,62}\/(?:[a-z0-9-]+\/)*[a-z0-9-]+$/.test(key)) {
    throw new Error('Chave de objeto inválida.');
  }
}

function validObject(key, data, digest) {
  validKey(key);
  if (!Buffer.isBuffer(data) || !data.length || data.length > 25 * 1024 * 1024 || sha256(data) !== digest) {
    throw new Error('Objeto inválido ou hash divergente.');
  }
}

// Private local adapter for development and integration tests. Never expose this directory statically.
export class FileObjects {
  private root;
  constructor(directory) { this.root = resolve(directory); }
  private path(key) { validKey(key); return resolve(this.root, key); }

  async put(key, data, digest) {
    validObject(key, data, digest);
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const temporary = target + '.' + randomUUID();
    try {
      await writeFile(temporary, data, { mode: 0o600, flag: 'wx', flush: true });
      try { await link(temporary, target); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (!(await readFile(target)).equals(data)) throw new Error('Objeto existente divergente.');
      }
    } finally { await rm(temporary, { force: true }); }
  }

  async get(key) { return readFile(this.path(key)); }
  async delete(key) { await rm(this.path(key), { force: true }); }
}

// Credentials stay on the server. Bucket has no public domain, r2.dev access or browser URLs.
export class R2Objects {
  private client;
  private bucket;
  constructor(config) {
    const endpoint = new URL(config.endpoint);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
      !/^[a-f0-9]{32}(?:\.(?:eu|us|fedramp))?\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname) ||
      endpoint.pathname !== '/' || endpoint.search || endpoint.hash || endpoint.port ||
      !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(config.bucket ?? '') ||
      !config.accessKeyId || !config.secretAccessKey) throw new Error('Configuração privada R2 inválida.');
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: endpoint.origin, region: 'auto', forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 3
    });
  }

  async put(key, data, digest) {
    validObject(key, data, digest);
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket, Key: key, Body: data, ContentType: 'application/octet-stream',
        ContentLength: data.length, IfNoneMatch: '*', Metadata: { sha256: digest }
      }), { abortSignal: AbortSignal.timeout(30000) });
    } catch (error) {
      if (error.$metadata?.httpStatusCode !== 412) throw error;
      // Lost responses/retries must never overwrite confirmed media with different content.
      if (!(await this.get(key)).equals(data)) throw new Error('Objeto existente divergente.');
    }
  }

  async get(key) {
    validKey(key);
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(30000) });
    const parts = [];
    let bytes = 0;
    try {
      for await (const part of response.Body) {
        bytes += part.length;
        if (bytes > 25 * 1024 * 1024) throw new Error('Objeto acima do limite.');
        parts.push(part);
      }
      return Buffer.concat(parts);
    } finally { response.Body?.destroy(); }
  }

  async delete(key) {
    validKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(30000) });
  }
  close() { this.client.destroy(); }
}
