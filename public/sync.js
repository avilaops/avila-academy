const list=document.getElementById('remote');
const status=document.getElementById('sync-status');
const upload=document.getElementById('upload');
let current;
window.addEventListener('academy:draft',event=>{current=event.detail;upload.hidden=false;});
async function request(path,options) {
  const response=await fetch(path,options);
  if(response.status===401) throw Error('Entre com sua conta de produtor para sincronizar.');
  if(!response.ok) throw Error('Falha ao sincronizar. O rascunho local continua disponível.');
  return response;
}
upload.onclick=async()=>{
  if(!current)return;
  upload.disabled=true;
  const draft=current;
  try {
    // Persist the remote ID with the local draft so a failed transfer can resume.
    const {drafts}=await import('./storage.js');
    if(!draft.remoteId) {
      const response=await request('/api/recordings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...draft,blob:undefined,mime:draft.blob.type})});
      draft.remoteId=(await response.json()).id;
      await drafts('save',draft);
    }
    const records=await (await request('/api/recordings')).json();
    const saved=records.find(item=>item.id===draft.remoteId);
    if(!saved)throw Error('Gravação do servidor indisponível.');
    const size=4*1024*1024;
    if(saved.state==='uploading') {
      for(let i=saved.next_chunk;i<Math.ceil(draft.blob.size/size);i++) {
        status.textContent='Enviando parte '+(i+1)+' de '+Math.ceil(draft.blob.size/size);
        await request('/api/recordings/'+draft.remoteId+'/chunks?number='+i,{method:'PUT',body:draft.blob.slice(i*size,(i+1)*size)});
      }
      await request('/api/recordings/'+draft.remoteId+'/complete',{method:'POST'});
    }
    status.textContent='Aula salva no servidor.';
    await refresh();
  }catch(error){status.textContent=error.message;}
  finally{upload.disabled=false;}
};
async function refresh(){
  list.replaceChildren();
  try{
    const records=await (await request('/api/recordings')).json();
    for(const record of records){
      const li=document.createElement('li');
      li.textContent=[record.course,record.unit,record.title].join(' / ');
      if(record.state==='ready'){
        const a=document.createElement('a');
        a.href='/api/recordings/'+record.id+'/media';a.textContent='Abrir gravação';a.target='_blank';a.rel='noopener';
        li.append(document.createElement('br'),a);
      }else li.append(' — envio incompleto');
      list.append(li);
    }
    if(!records.length) list.textContent='Nenhuma aula no servidor.';
  }catch(error){status.textContent=error.message;}
}
refresh();
