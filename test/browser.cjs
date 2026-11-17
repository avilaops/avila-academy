const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--auto-select-desktop-capture-source=Entire screen']});
try {
const context=await browser.newContext();
let page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.goto('http://abraao.localhost:3071');
await page.click('#prepare');
await page.getByText('Prévia pronta.',{exact:false}).waitFor();
await page.evaluate(()=>window.testTracks=document.getElementById('preview').srcObject.getTracks());
await page.click('#cancel-preview');
assert(await page.evaluate(()=>window.testTracks.every(track=>track.readyState==='ended')));
for(const mode of ['camera','audio','screen','combined']){
await page.fill('#course','Curso piloto');await page.fill('#unit','Introdução');await page.fill('#title','Aula '+mode);
await page.selectOption('#mode',mode);
await page.click('#prepare');
await page.getByText('Prévia pronta.',{exact:false}).waitFor();
assert.equal(await page.locator('#stop').isVisible(),false);
assert(await page.evaluate(()=>document.getElementById('preview').srcObject.getAudioTracks().length===1));
await page.click('#record');
await page.locator('#stop').waitFor({timeout:7000});
await page.waitForTimeout(900);
await page.click('#pause');
await page.getByText('Gravação pausada.',{exact:false}).waitFor();
await page.click('#pause');
await page.waitForTimeout(600);
await page.click('#stop');
await page.getByText('Rascunho salvo.',{exact:false}).waitFor();
await page.reload();await page.locator('#drafts button').filter({hasText:'Aula '+mode}).click();
await page.waitForFunction(()=>document.querySelector('#download').href.startsWith('blob:')&&!document.querySelector('#download').hidden);
const bytes=await page.evaluate(async()=> (await (await fetch(document.querySelector('#download').href)).blob()).size);
assert(bytes>1000);
const type=await page.evaluate(async()=> (await (await fetch(document.querySelector('#download').href)).blob()).type);
assert.match(type,/^(video|audio)\//);
console.log(mode,bytes,type);
}
const fixture=await page.evaluate(async()=>{
  const blob=await (await fetch(document.querySelector('#download').href)).blob();
  return {type:blob.type,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
});
await page.fill('#course','Curso piloto');
await page.fill('#unit','Introdução');
await page.fill('#title','Aula importada');
await page.locator('#import-media').setInputFiles({name:'gravacao.webm',mimeType:fixture.type.split(';')[0],buffer:Buffer.from(fixture.bytes)});
await page.getByText('Aula importada.',{exact:false}).waitFor();
await page.reload();
await page.locator('#drafts button').filter({hasText:'Aula importada'}).click();
await page.waitForFunction(()=>document.querySelector('#download').href.startsWith('blob:')&&!document.querySelector('#download').hidden);
assert.equal(await page.evaluate(async()=> (await (await fetch(document.querySelector('#download').href)).blob()).size),fixture.bytes.length);
await page.locator('#import-media').setInputFiles({name:'invalido.txt',mimeType:'text/plain',buffer:Buffer.from('texto')});
await page.getByText('Escolha um arquivo', {exact:false}).waitFor();
assert.deepEqual(errors,[]);
// Recovery after an abrupt renderer failure during an active capture uses committed IndexedDB chunks.
await page.fill('#course','Curso piloto');await page.fill('#unit','Introdução');await page.fill('#title','Captura interrompida');
await page.click('#record');
await page.locator('#stop').waitFor();
await page.waitForFunction(async()=>{
  const {drafts}=await import('/storage.js');
  return (await drafts('list')).some(draft=>draft.title==='Captura interrompida'&&draft.captureComplete===false&&draft.bytes>0);
});
const cdp=await context.newCDPSession(page);
await Promise.race([cdp.send('Page.crash').catch(()=>{}),page.waitForEvent('crash')]);
await page.close();
page=await context.newPage();
page.on('pageerror',error=>errors.push(error.message));
await page.goto('http://abraao.localhost:3071');
await page.getByRole('button',{name:'Finalizar trecho recuperado: Captura interrompida',exact:true}).click();
await page.getByText('Trecho recuperado.',{exact:false}).waitFor();
assert(await page.evaluate(async()=>{
  const {drafts}=await import('/storage.js');
  const draft=(await drafts('list')).find(draft=>draft.title==='Captura interrompida');
  return draft.captureComplete===true&&draft.bytes>0;
}));

// Mock transport verifies the capture/upload UI independently of the real OIDC deployment.
let remote;
let lostResponse=false;
const uploaded=[];
await page.route('**/api/recordings',async route=>{
  if(route.request().method()==='POST'){
    const data=route.request().postDataJSON();
    remote={id:data.uploadId,state:'uploading',next_chunk:0,bytes:0,...data};
    await route.fulfill({status:201,json:{id:remote.id}});
  }else await route.fulfill({json:remote?[remote]:[]});
});
await page.route('**/api/recordings/*/chunks?number=*',async route=>{
  const index=Number(new URL(route.request().url()).searchParams.get('number'));
  assert.equal(index,remote.next_chunk);
  const body=route.request().postDataBuffer();
  uploaded.push(body);remote.bytes+=body.length;remote.next_chunk++;
  if(!lostResponse){lostResponse=true;await route.abort('failed');}
  else await route.fulfill({json:{saved:true}});
});
await page.route('**/api/recordings/*/complete',async route=>{
  const data=route.request().postDataJSON();
  assert.equal(data.bytes,remote.bytes);assert.equal(data.chunks,remote.next_chunk);
  remote.state='ready';await route.fulfill({json:{ready:true}});
});
await page.fill('#course','Curso piloto');await page.fill('#unit','Introdução');await page.fill('#title','Envio durante captura');
await page.locator('#live-upload').check();
await page.click('#record');
await page.locator('#stop').waitFor();
for(let attempt=0;attempt<40 && !uploaded.length;attempt++)await page.waitForTimeout(500);
assert(uploaded.length>0,'Nenhuma parte foi enviada durante a captura');
assert.equal(remote.state,'uploading');
await page.click('#stop');
await page.getByText('Rascunho salvo.',{exact:false}).waitFor();
await page.getByRole('button',{name:'Salvar aula no servidor',exact:true}).click();
await page.getByText('Aula salva no servidor.',{exact:false}).waitFor();
const local=await page.evaluate(async()=>Array.from(new Uint8Array(await (await (await fetch(document.querySelector('#download').href)).blob()).arrayBuffer())));
assert.deepEqual(Buffer.concat(uploaded),Buffer.from(local));
assert.equal(remote.state,'ready');
assert(lostResponse);

await page.goto('http://demo.localhost:3071');await page.getByText('Nenhuma aula gravada.').waitFor();
// Component fixture only: real session/enrollment authorization is verified in auth.test.ts.
let progress={seconds:0,completed:0};
await page.route('**/api/student/courses',route=>route.fulfill({json:[{
  title:'Curso do aluno',description:'Descrição',modules:[{title:'Introdução',lessons:[{
    id:'fixture-lesson',title:'Aula publicada',description:'Material da aula',attachments:[{id:'fixture-attachment',name:'Guia.pdf'}],...progress
  }]}]
}]}));
await page.route('**/api/student/lessons/fixture-lesson/media',route=>route.fulfill({
  contentType:fixture.type,body:Buffer.from(fixture.bytes)
}));
await page.route('**/api/student/lessons/fixture-lesson/progress',async route=>{
  progress=route.request().postDataJSON();
  assert.equal(progress.completed,true);
  assert(progress.seconds>=0);
  await route.fulfill({json:{saved:true}});
});
await page.goto('http://abraao.localhost:3071/aluno');
await page.getByRole('button',{name:'Continuar curso'}).click();
await page.locator('#player video').waitFor();
assert.equal(await page.getByRole('link',{name:'Guia.pdf',exact:true}).getAttribute('href'),'/api/student/lessons/fixture-lesson/attachments/fixture-attachment');
await page.getByRole('button',{name:'Marcar como concluída'}).click();
await page.getByRole('button',{name:'Aula concluída',exact:true}).waitFor();
await page.reload();
await page.getByText('1 de 1 aulas concluídas').waitFor();
assert.deepEqual(errors,[]);
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
