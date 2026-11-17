const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--auto-select-desktop-capture-source=Entire screen']});
try {
const page=await browser.newPage();
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
