import {syncDraft} from './upload.js';
const list=document.getElementById('remote');
const status=document.getElementById('sync-status');
const upload=document.getElementById('upload');
let current;
window.addEventListener('academy:draft',event=>{
  current=event.detail;
  upload.hidden=false;
  upload.disabled=current.captureComplete===false;
});
window.addEventListener('academy:sync-status',event=>{status.textContent=event.detail;});
window.addEventListener('academy:remote-updated',refresh);
upload.onclick=async()=>{
  if(!current || current.captureComplete===false)return;
  upload.disabled=true;
  try{await syncDraft(current.id);await refresh();}
  catch(error){status.textContent=error.message;}
  finally{upload.disabled=false;}
};
async function refresh(){
  list.replaceChildren();
  try{
    const response=await fetch('/api/recordings');
    if(!response.ok)throw Error('Entre com sua conta de produtor para sincronizar.');
    for(const record of await response.json()){
      const li=document.createElement('li');
      li.textContent=[record.course,record.unit,record.title].join(' / ');
      if(record.state==='ready'){
        const a=document.createElement('a');
        a.href='/api/recordings/'+record.id+'/media';a.textContent='Abrir gravação';a.target='_blank';a.rel='noopener';
        li.append(document.createElement('br'),a);
      }else li.append(' — envio incompleto');
      list.append(li);
    }
    if(!list.children.length)list.textContent='Nenhuma aula no servidor.';
  }catch(error){status.textContent=error.message;}
}
refresh();
