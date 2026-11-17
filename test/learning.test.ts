import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {catalog} from '../catalog.ts';

test('matrícula controla publicação, progresso e mídia, com revogação imediata nas novas requisições',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'academy-student-'));
  let store=catalog(directory);
  // Fixture exercises the catalog authorization rules. Real HTTP sessions remain enforced in server.ts.
  const server=createServer((req,res)=>store.handle(req,res,req.headers['x-tenant']??'a',req.headers['x-subject']??'student')).listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.close();await rm(directory,{recursive:true});});
  const base='http://127.0.0.1:'+server.address().port;
  const call=(path,method='GET',data,headers={})=>fetch(base+path,{method,body:data===undefined?undefined:JSON.stringify(data),headers});
  const create=async(path,data)=>(await call(path,'POST',data)).json();
  const course=await create('/api/courses',{title:'Curso'});
  const module=await create('/api/courses/'+course.id+'/modules',{title:'Módulo'});
  const recording=await create('/api/recordings',{title:'Vídeo',course:'Curso',unit:'Módulo',mime:'video/webm'});
  for(const [number,body] of ['abc','def'].entries()) {
    assert.equal((await fetch(base+'/api/recordings/'+recording.id+'/chunks?number='+number,{method:'PUT',body})).status,200);
  }
  await call('/api/recordings/'+recording.id+'/complete','POST');
  const lesson=await create('/api/courses/'+module.id+'/lessons',{title:'Aula',recordingId:recording.id});
  const materialId=randomUUID();
  const materialPath='/api/attachments/'+lesson.id;
  const uploadMaterial=(data='material',tenant='a')=>fetch(base+materialPath+'?name=Guia.pdf',{
    method:'POST',headers:{'Content-Type':'application/pdf','X-Upload-Id':materialId,'x-tenant':tenant},body:data
  });
  const oversize=await fetch(base+materialPath+'?name=Grande.pdf',{
    method:'POST',headers:{'Content-Type':'application/pdf','X-Upload-Id':randomUUID()},body:Buffer.alloc(25*1024*1024+1)
  });
  assert.equal(oversize.status,413);
  const forbidden=await fetch(base+materialPath+'?name=pagina.html',{
    method:'POST',headers:{'Content-Type':'text/html','X-Upload-Id':randomUUID()},body:'<h1>Arquivo</h1>'
  });
  assert.equal(forbidden.status,400);
  assert.equal((await uploadMaterial()).status,201);
  assert.equal((await uploadMaterial()).status,200);
  assert.equal((await uploadMaterial('conteúdo diferente')).status,409);
  assert.equal((await uploadMaterial('material','b')).status,404);
  assert.equal((await call(materialPath+'/'+materialId,'DELETE',undefined,{'x-tenant':'b'})).status,404);
  const studentMaterial='/api/student/lessons/'+lesson.id+'/attachments/'+materialId;
  assert.equal((await call(studentMaterial)).status,404);
  const media='/api/student/lessons/'+lesson.id+'/media';
  const progress='/api/student/lessons/'+lesson.id+'/progress';
  assert.equal((await call(media)).status,404);
  await call('/api/enrollments','POST',{courseId:course.id,subject:'student'});
  const unpublished=await (await call('/api/student/courses')).json();
  assert.deepEqual(unpublished[0].modules[0].lessons,[]);
  assert.equal((await call(media)).status,404);
  await call('/api/courses/'+lesson.id,'PATCH',{published:true});
  assert.equal(await (await call(media)).text(),'abcdef');
  const material=await call(studentMaterial);
  assert.equal(material.status,200);assert.equal(await material.text(),'material');
  assert.equal(material.headers.get('content-type'),'application/octet-stream');
  assert.match(material.headers.get('content-disposition'),/^attachment;/);
  assert.equal((await call(studentMaterial,'GET',undefined,{'x-subject':'stranger'})).status,404);
  assert.equal((await call(studentMaterial,'GET',undefined,{'x-tenant':'b'})).status,404);
  const range=await call(media,'GET',undefined,{Range:'bytes=2-4'});
  assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),'bytes 2-4/6');
  assert.equal(await range.text(),'cde');
  assert.equal(await (await call(media,'GET',undefined,{Range:'bytes=-2'})).text(),'ef');
  assert.equal((await call(media,'GET',undefined,{Range:'bytes=8-9'})).status,416);
  assert.equal((await call(media,'GET',undefined,{'x-subject':'stranger'})).status,404);
  assert.equal((await call(media,'GET',undefined,{'x-tenant':'b'})).status,404);
  assert.equal((await call(progress,'POST',{seconds:42,completed:true})).status,200);
  assert.equal((await call(progress,'POST',{seconds:-1,completed:false})).status,400);
  store.close();store=catalog(directory);
  const outline=await (await call('/api/student/courses')).json();
  assert.equal(outline[0].modules[0].lessons[0].seconds,42);
  assert.equal(outline[0].modules[0].lessons[0].attachments[0].name,'Guia.pdf');
  assert.equal(await (await call(studentMaterial)).text(),'material');
  assert.equal(outline[0].modules[0].lessons[0].completed,1);
  const [enrollment]=await (await call('/api/enrollments')).json();
  assert.equal((await call('/api/enrollments/'+enrollment.id,'PATCH',{active:false},{'x-tenant':'b'})).status,404);
  await call('/api/enrollments/'+enrollment.id,'PATCH',{active:false});
  assert.deepEqual(await (await call('/api/student/courses')).json(),[]);
  assert.equal((await call(media)).status,404);
  assert.equal((await call(progress,'POST',{seconds:43,completed:true})).status,404);
  assert.equal((await call(studentMaterial)).status,404);
  await call('/api/enrollments','POST',{courseId:course.id,subject:'student'});
  assert.equal((await (await call('/api/enrollments')).json()).length,1);
  await call('/api/courses/'+lesson.id,'PATCH',{published:false});
  assert.equal((await call(studentMaterial)).status,404);
  assert.equal((await call(materialPath+'/'+materialId,'DELETE')).status,200);
  assert.equal((await call(materialPath+'/'+materialId)).status,404);
  assert.equal((await call(media)).status,404);
});
