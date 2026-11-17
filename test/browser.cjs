const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--auto-select-desktop-capture-source=Entire screen']});
try {
const page=await browser.newPage();
page.on('pageerror',console.error);
await page.goto('http://abraao.localhost:3071');
for(const mode of ['camera','audio','screen','combined']){
await page.fill('#course','Curso piloto');await page.fill('#unit','Introdução');await page.fill('#title','Aula '+mode);
await page.selectOption('#mode',mode);await page.click('#record');
await page.locator('#stop').waitFor({timeout:7000});
await page.waitForTimeout(1500);await page.click('#stop');
await page.getByText('Rascunho salvo.',{exact:false}).waitFor();
await page.reload();await page.locator('#drafts button').filter({hasText:'Aula '+mode}).click();
const bytes=await page.evaluate(async()=> (await (await fetch(document.querySelector('#download').href)).blob()).size);
assert(bytes>1000);console.log(mode,bytes);
}
await page.goto('http://demo.localhost:3071');await page.getByText('Nenhuma aula gravada.').waitFor();
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
