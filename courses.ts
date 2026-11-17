import { randomUUID } from 'node:crypto';

export function courseCatalog(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY, tenant TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS courses_tenant ON courses(tenant);
    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id),
      title TEXT NOT NULL, position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY, module_id TEXT NOT NULL REFERENCES modules(id),
      recording_id TEXT NOT NULL REFERENCES recordings(id), title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL,
      published INTEGER NOT NULL DEFAULT 0
    );
  `);
  const getCourse = (tenant,id) => db.prepare('SELECT * FROM courses WHERE tenant=? AND id=?').get(tenant,id);
  const getModule = (tenant,id) => db.prepare(`
    SELECT modules.* FROM modules JOIN courses ON courses.id=modules.course_id
    WHERE courses.tenant=? AND modules.id=?
  `).get(tenant,id);
  const getLesson = (tenant,id) => db.prepare(`
    SELECT lessons.* FROM lessons JOIN modules ON modules.id=lessons.module_id
    JOIN courses ON courses.id=modules.course_id WHERE courses.tenant=? AND lessons.id=?
  `).get(tenant,id);
  const titleValid = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
  const descriptionValid = value => value === undefined || (typeof value === 'string' && value.length <= 10000);
  const positionValid = value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000;
  async function body(req) {
    let size=0;
    const parts=[];
    for await (const part of req) {
      size+=part.length;
      if(size>16384) throw Error('size');
      parts.push(part);
    }
    return JSON.parse(Buffer.concat(parts).toString());
  }
  function outline(tenant) {
    const courses = db.prepare('SELECT * FROM courses WHERE tenant=? ORDER BY created,id').all(tenant);
    for (const course of courses) {
      course.modules = db.prepare('SELECT * FROM modules WHERE course_id=? ORDER BY position,id').all(course.id);
      for (const module of course.modules) {
        module.lessons = db.prepare('SELECT * FROM lessons WHERE module_id=? ORDER BY position,id').all(module.id);
      }
    }
    return courses;
  }
  return async function handle(req,res,tenant) {
    const path = new URL(req.url,'http://localhost').pathname;
    const send = (status,data={}) => res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(data));
    try {
      if(path==='/api/courses') {
        if(req.method==='GET') {send(200,outline(tenant));return;}
        if(req.method!=='POST') {send(405);return;}
        const data=await body(req);
        if(!titleValid(data.title)||!descriptionValid(data.description)) {send(400);return;}
        const id=randomUUID();
        db.prepare('INSERT INTO courses VALUES(?,?,?,?,?)').run(id,tenant,data.title.trim(),data.description??'',Date.now());
        send(201,{id});return;
      }
      const match=path.match(/^\/api\/courses\/([a-f0-9-]{36})(?:\/(modules|lessons|reorder))?$/);
      if(!match) {send(404);return;}
      const [,id,action]=match;
      if(action==='modules' && req.method==='POST') {
        if(!getCourse(tenant,id)) {send(404);return;}
        const data=await body(req);
        if(!titleValid(data.title)) {send(400);return;}
        const moduleId=randomUUID();
        const next=db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS value FROM modules WHERE course_id=?').get(id).value;
        db.prepare('INSERT INTO modules VALUES(?,?,?,?)').run(moduleId,id,data.title.trim(),next);
        send(201,{id:moduleId});return;
      }
      if(action==='lessons' && req.method==='POST') {
        if(!getModule(tenant,id)) {send(404);return;}
        const data=await body(req);
        if(!titleValid(data.title)||!descriptionValid(data.description)||typeof data.recordingId!=='string') {send(400);return;}
        const recording=db.prepare("SELECT id FROM recordings WHERE tenant=? AND id=? AND state='ready'").get(tenant,data.recordingId);
        if(!recording) {send(404);return;}
        const lessonId=randomUUID();
        const next=db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS value FROM lessons WHERE module_id=?').get(id).value;
        db.prepare('INSERT INTO lessons VALUES(?,?,?,?,?,?,0)').run(lessonId,id,data.recordingId,data.title.trim(),data.description??'',next);
        send(201,{id:lessonId});return;
      }
      if(action==='reorder' && req.method==='POST') {
        if(!getCourse(tenant,id)) {send(404);return;}
        const data=await body(req);
        const existing=db.prepare('SELECT id FROM modules WHERE course_id=?').all(id).map(row=>row.id);
        if(!Array.isArray(data.ids)||data.ids.length!==existing.length||new Set(data.ids).size!==existing.length||!data.ids.every(value=>existing.includes(value))) {send(400);return;}
        db.exec('BEGIN IMMEDIATE');
        try {
          data.ids.forEach((moduleId,position)=>db.prepare('UPDATE modules SET position=? WHERE id=? AND course_id=?').run(position,moduleId,id));
          db.exec('COMMIT');
        } catch(error) {db.exec('ROLLBACK');throw error;}
        send(200,{saved:true});return;
      }
      if(req.method==='PATCH' && !action) {
        const data=await body(req);
        const course=getCourse(tenant,id);
        const module=getModule(tenant,id);
        const lesson=getLesson(tenant,id);
        if(!course&&!module&&!lesson) {send(404);return;}
        if(data.title!==undefined&&!titleValid(data.title) || !descriptionValid(data.description) || data.position!==undefined&&!positionValid(data.position) || data.published!==undefined&&typeof data.published!=='boolean') {send(400);return;}
        if(course) {
          db.prepare('UPDATE courses SET title=?,description=? WHERE id=?').run(data.title?.trim()??course.title,data.description??course.description,id);
        } else if(module) {
          db.prepare('UPDATE modules SET title=?,position=? WHERE id=?').run(data.title?.trim()??module.title,data.position??module.position,id);
        } else {
          db.prepare('UPDATE lessons SET title=?,description=?,position=?,published=? WHERE id=?').run(
            data.title?.trim()??lesson.title,data.description??lesson.description,data.position??lesson.position,
            data.published===undefined?lesson.published:Number(data.published),id);
        }
        send(200,{saved:true});return;
      }
      send(405);
    } catch {send(400,{error:'Dados inválidos'});}
  };
}
