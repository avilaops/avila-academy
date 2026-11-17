import { randomUUID } from 'node:crypto';

export function learningCatalog(db, serveMedia, attachments) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY, tenant TEXT NOT NULL, course_id TEXT NOT NULL REFERENCES courses(id),
      subject TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(tenant,course_id,subject)
    );
    CREATE TABLE IF NOT EXISTS progress (
      enrollment_id TEXT NOT NULL REFERENCES enrollments(id), lesson_id TEXT NOT NULL REFERENCES lessons(id),
      seconds REAL NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL,
      PRIMARY KEY(enrollment_id,lesson_id)
    );
  `);
  async function body(req) {
    const parts=[]; let length=0;
    for await(const part of req) {
      length+=part.length;
      if(length>4096) throw Error('size');
      parts.push(part);
    }
    return JSON.parse(Buffer.concat(parts).toString());
  }
  function accessible(tenant,subject,id) {
    return db.prepare(`
      SELECT l.id,l.recording_id,e.id AS enrollment_id FROM lessons l
      JOIN modules m ON m.id=l.module_id JOIN courses c ON c.id=m.course_id
      JOIN enrollments e ON e.course_id=c.id AND e.tenant=c.tenant
      JOIN recordings r ON r.id=l.recording_id AND r.tenant=c.tenant AND r.state='ready'
      WHERE c.tenant=? AND e.subject=? AND e.active=1 AND l.published=1 AND l.id=?
    `).get(tenant,subject,id);
  }
  return async function handle(req,res,tenant,subject) {
    const path=new URL(req.url,'http://localhost').pathname;
    const send=(status,data={})=>res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(data));
    try {
      if(path==='/api/enrollments') {
        if(req.method==='GET') {send(200,db.prepare('SELECT * FROM enrollments WHERE tenant=? ORDER BY id').all(tenant));return;}
        if(req.method!=='POST') {send(405);return;}
        const data=await body(req);
        if(typeof data.subject!=='string'||!data.subject.trim()||data.subject.length>255||typeof data.courseId!=='string') {send(400);return;}
        if(!db.prepare('SELECT id FROM courses WHERE tenant=? AND id=?').get(tenant,data.courseId)) {send(404);return;}
        db.prepare(`INSERT INTO enrollments(id,tenant,course_id,subject) VALUES(?,?,?,?)
          ON CONFLICT(tenant,course_id,subject) DO UPDATE SET active=1`).run(randomUUID(),tenant,data.courseId,data.subject.trim());
        send(200,{saved:true});return;
      }
      const enrollment=path.match(/^\/api\/enrollments\/([a-f0-9-]{36})$/);
      if(enrollment && req.method==='PATCH') {
        const data=await body(req);
        if(typeof data.active!=='boolean') {send(400);return;}
        const result=db.prepare('UPDATE enrollments SET active=? WHERE tenant=? AND id=?').run(Number(data.active),tenant,enrollment[1]);
        send(result.changes?200:404);return;
      }
      if(!subject) {send(401);return;}
      if(path==='/api/student/courses' && req.method==='GET') {
        const courses=db.prepare(`SELECT c.*,e.id AS enrollment_id FROM courses c JOIN enrollments e ON e.course_id=c.id AND e.tenant=c.tenant
          WHERE c.tenant=? AND e.subject=? AND e.active=1 ORDER BY c.created,c.id`).all(tenant,subject);
        for(const course of courses) {
          course.modules=db.prepare('SELECT id,title,position FROM modules WHERE course_id=? ORDER BY position,id').all(course.id);
          for(const module of course.modules) {
            module.lessons=db.prepare(`SELECT l.id,l.title,l.description,l.position,
              COALESCE(p.seconds,0) AS seconds,COALESCE(p.completed,0) AS completed
              FROM lessons l JOIN recordings r ON r.id=l.recording_id AND r.tenant=? AND r.state='ready'
              LEFT JOIN progress p ON p.lesson_id=l.id AND p.enrollment_id=?
              WHERE l.module_id=? AND l.published=1 ORDER BY l.position,l.id`).all(tenant,course.enrollment_id,module.id);
            for(const lesson of module.lessons) lesson.attachments=attachments.list(lesson.id);
          }
        }
        send(200,courses);return;
      }
      const material=path.match(/^\/api\/student\/lessons\/([a-f0-9-]{36})\/attachments\/([a-f0-9-]{36})$/);
      if(material && req.method==='GET') {
        if(!accessible(tenant,subject,material[1])){send(404);return;}
        attachments.download(res,material[2],material[1]);return;
      }
      const lesson=path.match(/^\/api\/student\/lessons\/([a-f0-9-]{36})\/(media|progress)$/);
      if(!lesson) {send(404);return;}
      const access=accessible(tenant,subject,lesson[1]);
      if(!access) {send(404);return;}
      if(lesson[2]==='media' && req.method==='GET') {
        const media=db.prepare('SELECT * FROM recordings WHERE tenant=? AND id=?').get(tenant,access.recording_id);
        await serveMedia(req,res,media);return;
      }
      if(lesson[2]==='progress' && req.method==='POST') {
        const data=await body(req);
        if(!Number.isFinite(data.seconds)||data.seconds<0||data.seconds>604800||typeof data.completed!=='boolean') {send(400);return;}
        // Recheck after reading the body: enrollment may have been revoked while it arrived.
        if(!accessible(tenant,subject,lesson[1])) {send(404);return;}
        db.prepare(`INSERT INTO progress VALUES(?,?,?,?,?)
          ON CONFLICT(enrollment_id,lesson_id) DO UPDATE SET
          seconds=excluded.seconds,completed=MAX(progress.completed,excluded.completed),updated=excluded.updated`)
          .run(access.enrollment_id,lesson[1],data.seconds,Number(data.completed),Date.now());
        send(200,{saved:true});return;
      }
      send(405);
    } catch {if(!res.headersSent)send(400,{error:'Dados inválidos'});else res.end();}
  };
}
