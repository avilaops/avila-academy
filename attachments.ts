import { createHash } from 'node:crypto';

export function attachmentsCatalog(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL REFERENCES lessons(id), name TEXT NOT NULL,
    mime TEXT NOT NULL, bytes INTEGER NOT NULL, digest TEXT NOT NULL, data BLOB NOT NULL
  )`);
  const lesson=(tenant,id)=>db.prepare(`SELECT l.id FROM lessons l JOIN modules m ON m.id=l.module_id
    JOIN courses c ON c.id=m.course_id WHERE c.tenant=? AND l.id=?`).get(tenant,id);
  function list(id) {
    return db.prepare('SELECT id,name,mime,bytes FROM attachments WHERE lesson_id=? ORDER BY name,id').all(id);
  }
  function download(res,id,lessonId) {
    const file=db.prepare('SELECT * FROM attachments WHERE id=? AND lesson_id=?').get(id,lessonId);
    if(!file){res.writeHead(404).end();return;}
    const name=encodeURIComponent(file.name).replace(/'/g,'%27');
    res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':file.bytes,
      'Content-Disposition':"attachment; filename*=UTF-8''"+name,'X-Content-Type-Options':'nosniff'});
    res.end(file.data);
  }
  return {
    list,download,
    async handle(req,res,tenant) {
      const url=new URL(req.url,'http://localhost');
      const match=url.pathname.match(/^\/api\/attachments\/([a-f0-9-]{36})(?:\/([a-f0-9-]{36}))?$/);
      const send=(status,data={})=>res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(data));
      if(!match || !lesson(tenant,match[1])) {send(404);return;}
      const [,lessonId,id]=match;
      if(req.method==='GET') {if(id)download(res,id,lessonId);else send(200,list(lessonId));return;}
      if(req.method==='DELETE' && id) {
        const result=db.prepare('DELETE FROM attachments WHERE id=? AND lesson_id=?').run(id,lessonId);
        send(result.changes?200:404);return;
      }
      if(req.method!=='POST'||id){send(405);return;}
      try{
        const name=url.searchParams.get('name');
        const mime=req.headers['content-type'];
        const uploadId=req.headers['x-upload-id'];
        if(!name||name.length>180||/[\x00-\x1f\x7f/\\]/.test(name) ||
          !['application/pdf','image/png','image/jpeg','text/plain','application/zip'].includes(mime) ||
          typeof uploadId!=='string'||!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(uploadId)) {send(400);return;}
        const parts=[];let length=0;
        for await(const part of req.iterator({destroyOnReturn:false})) {
          length+=part.length;
          if(length>25*1024*1024){req.resume();send(413);return;}
          parts.push(part);
        }
        if(!length){send(400);return;}
        const data=Buffer.concat(parts);
        const digest=createHash('sha256').update(data).digest('hex');
        const existing=db.prepare('SELECT lesson_id,name,mime,digest FROM attachments WHERE id=?').get(uploadId);
        if(existing){
          if(existing.lesson_id!==lessonId||existing.name!==name||existing.mime!==mime||existing.digest!==digest){send(409);return;}
          send(200,{id:uploadId});return;
        }
        db.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?)').run(uploadId,lessonId,name,mime,length,digest,data);
        send(201,{id:uploadId});
      }catch {if(!res.headersSent)send(400);else res.end();}
    }
  };
}
