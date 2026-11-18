import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PostgresDatabase} from '../../persistence/postgres.ts';
import {PostgresCourses} from '../../persistence/courses.ts';
import {PostgresLearning} from '../../persistence/learning.ts';

test('aulas e matrículas PostgreSQL preservam acesso, revogação e progresso',async t=>{
  assert(process.env.DATABASE_URL);
  const database=new PostgresDatabase(process.env.DATABASE_URL);
  const courses=new PostgresCourses(database);
  const learning=new PostgresLearning(database);
  const tenants=['learning-a-'+randomUUID(),'learning-b-'+randomUUID()];
  t.after(async()=>{
    try{
      for(const tenant of tenants)await database.transaction(tenant,async connection=>{
        for(const table of ['progress','enrollments','lessons','modules','courses','recordings','academies'])
          await connection.query('DELETE FROM '+table);
      });
    }finally{await database.close();}
  });
  for(const tenant of tenants)await database.transaction(tenant,connection=>connection.query('INSERT INTO academies(id,name) VALUES($1,$2)',[tenant,tenant]));
  const course=await courses.create(tenants[0],'Curso do aluno');
  const module=await courses.addModule(tenants[0],course.id,'Módulo');
  const recordingId=randomUUID();
  await database.transaction(tenants[0],connection=>connection.query(
    "INSERT INTO recordings(id,tenant,title,course,unit,mime,created) VALUES($1,$2,'Vídeo','Curso','Módulo','video/webm',$3)",
    [recordingId,tenants[0],Date.now()]));
  assert.equal(await courses.addLesson(tenants[0],module.id,recordingId,'Aula'),null);
  // Metadata fixture for authorization only. No video object or playback is created.
  await database.transaction(tenants[0],connection=>connection.query("UPDATE recordings SET state='ready' WHERE id=$1",[recordingId]));
  const lessons=await Promise.all(Array.from({length:3},(_,index)=>courses.addLesson(tenants[0],module.id,recordingId,'Aula '+index)));
  assert.deepEqual(lessons.map(lesson=>lesson.position).sort(),[0,1,2]);
  const lesson=lessons[0];
  const enrollment=await learning.enroll(tenants[0],course.id,'student');
  assert.equal((await learning.enroll(tenants[0],course.id,'student')).id,enrollment.id);
  assert.equal((await learning.listEnrollments(tenants[0])).length,1);
  assert.equal(await learning.enroll(tenants[1],course.id,'student'),null);
  assert.equal(await learning.access(tenants[0],'student',lesson.id),null);
  assert.deepEqual((await learning.outline(tenants[0],'student'))[0].modules[0].lessons,[]);
  await courses.publishLesson(tenants[0],lesson.id,true);
  assert(await learning.access(tenants[0],'student',lesson.id));
  assert.equal(await learning.access(tenants[0],'stranger',lesson.id),null);
  assert.equal(await learning.access(tenants[1],'student',lesson.id),null);
  assert.equal(await courses.publishLesson(tenants[1],lesson.id,false),null);
  assert.equal(await learning.saveProgress(tenants[0],'student',lesson.id,42,true),true);
  await learning.saveProgress(tenants[0],'student',lesson.id,12,false);
  const saved=(await learning.outline(tenants[0],'student'))[0].modules[0].lessons[0];
  assert.equal(saved.seconds,12);assert.equal(saved.completed,true);
  await assert.rejects(learning.saveProgress(tenants[0],'student',lesson.id,NaN,true));
  assert.equal(await learning.setActive(tenants[1],enrollment.id,false),null);
  await learning.setActive(tenants[0],enrollment.id,false);
  assert.equal(await learning.access(tenants[0],'student',lesson.id),null);
  assert.equal(await learning.saveProgress(tenants[0],'student',lesson.id,43,true),false);
  assert.deepEqual(await learning.outline(tenants[0],'student'),[]);
  await learning.enroll(tenants[0],course.id,'student');
  assert.equal((await learning.outline(tenants[0],'student'))[0].modules[0].lessons[0].completed,true);
  await courses.publishLesson(tenants[0],lesson.id,false);
  assert.equal(await learning.access(tenants[0],'student',lesson.id),null);
});
