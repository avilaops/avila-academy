import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { courseCatalog } from './courses.ts';
import { learningCatalog } from './learning.ts';
import { serveMedia } from './media.ts';
import { attachmentsCatalog } from './attachments.ts';
import { randomUUID } from 'node:crypto';

export function catalog(directory) {
  mkdirSync(directory,{recursive:true});
  const db = new DatabaseSync(resolve(directory,'academy.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY, tenant TEXT NOT NULL, title TEXT NOT NULL, course TEXT NOT NULL,
      unit TEXT NOT NULL, mime TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'uploading',
      next_chunk INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chunks (
      recording TEXT NOT NULL REFERENCES recordings(id), number INTEGER NOT NULL, data BLOB NOT NULL,
      PRIMARY KEY(recording,number)
    );`);
  const handleCourses = courseCatalog(db);
  const attachments = attachmentsCatalog(db);
  const handleLearning = learningCatalog(db,(req,res,item)=>serveMedia(db,req,res,item),attachments);
  function find(tenant,id) { return db.prepare('SELECT * FROM recordings WHERE tenant=? AND id=?').get(tenant,id); }
  async function body(req,limit) {
    const parts=[]; let length=0;
    for await (const part of req) {
      length+=part.length;
      if (length>limit) throw Error('size');
      parts.push(part);
    }
    return Buffer.concat(parts);
  }
  return {
    close:()=>db.close(),
    async handle(req,res,tenant,subject) {
      if(req.url.startsWith('/api/student/') || req.url.startsWith('/api/enrollments')) {await handleLearning(req,res,tenant,subject);return;}
      if(req.url.startsWith('/api/attachments/')) {await attachments.handle(req,res,tenant);return;}
      if (req.url.startsWith('/api/courses')) { await handleCourses(req,res,tenant); return; }
      const url=new URL(req.url,'http://localhost');
      const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(data));};
      try {
        if (url.pathname==='/api/recordings') {
          if(req.method==='GET') {
            send(200,db.prepare('SELECT id,title,course,unit,mime,state,bytes,created,next_chunk FROM recordings WHERE tenant=? ORDER BY created DESC').all(tenant)); return;
          }
          if(req.method!=='POST') {send(405,{});return;}
          const data=JSON.parse((await body(req,4096)).toString());
          if (!['title','course','unit'].every(key=>typeof data[key]==='string' && data[key].trim() && data[key].length<=160) || !/^(video|audio)\/(webm|mp4|ogg)(;.*)?$/.test(data.mime??'')) {send(400,{error:'Metadados inválidos'});return;}
          const id=randomUUID();
          db.prepare('INSERT INTO recordings(id,tenant,title,course,unit,mime,created) VALUES(?,?,?,?,?,?,?)').run(id,tenant,data.title.trim(),data.course.trim(),data.unit.trim(),data.mime,Date.now());
          send(201,{id});return;
        }
        const match=url.pathname.match(/^\/api\/recordings\/([a-f0-9-]{36})(?:\/(chunks|complete|media))?$/);
        if(!match) {send(404,{});return;}
        const [,id,action]=match;
        const item=find(tenant,id);
        if(!item) {send(404,{});return;}
        if(action==='chunks' && req.method==='PUT') {
          const number=Number(url.searchParams.get('number'));
          if(!Number.isSafeInteger(number)||number<0||item.state!=='uploading') {send(409,{});return;}
          const data=await body(req,8*1024*1024);
          if (!data.length) {send(400,{});return;}
          // Serialize the insert and counter change. A retry must contain the exact same bytes.
          db.exec('BEGIN IMMEDIATE');
          try {
            const current=find(tenant,id);
            if (number<current.next_chunk) {
              const previous=db.prepare('SELECT data FROM chunks WHERE recording=? AND number=?').get(id,number);
              if(!previous || !Buffer.from(previous.data).equals(data)) throw Error('conflict');
            } else {
              if(number!==current.next_chunk||current.bytes+data.length>1024*1024*1024) throw Error('conflict');
              db.prepare('INSERT INTO chunks VALUES(?,?,?)').run(id,number,data);
              db.prepare('UPDATE recordings SET next_chunk=next_chunk+1,bytes=bytes+? WHERE id=?').run(data.length,id);
            }
            db.exec('COMMIT');
          } catch { db.exec('ROLLBACK');send(409,{});return; }
          send(200,{saved:true});return;
        }
        if(action==='complete' && req.method==='POST') {
          if(!item.bytes) {send(409,{});return;}
          db.prepare("UPDATE recordings SET state='ready' WHERE id=? AND tenant=?").run(id,tenant);
          send(200,{ready:true});return;
        }
        if(action==='media' && req.method==='GET' && item.state==='ready') {
          await serveMedia(db,req,res,item);return;
        }
        send(405,{});
      } catch { if(!res.headersSent) send(400,{error:'Solicitação inválida ou arquivo acima do limite'});else res.end(); }
    }
  };
}
