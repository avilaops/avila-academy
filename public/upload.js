import {drafts} from './storage.js';

const pending=new Map();
function report(message) {
  window.dispatchEvent(new CustomEvent('academy:sync-status',{detail:message}));
}
async function request(path,options) {
  const response=await fetch(path,{...options,signal:AbortSignal.timeout(30000)});
  if(response.status===401)throw Error('Entre com sua conta de produtor para sincronizar.');
  if(!response.ok)throw Error('Envio interrompido. O rascunho local permite tentar novamente.');
  return response;
}
async function transfer(id) {
  let draft=await drafts('get',id);
  if(!draft.blob.size)return;
  if(!draft.remoteId) {
    const response=await request('/api/recordings',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({uploadId:draft.id,title:draft.title,course:draft.course,unit:draft.unit,mime:draft.blob.type})});
    const remoteId=(await response.json()).id;
    await drafts('patch',{id,changes:{remoteId}});
    draft={...draft,remoteId};
  }
  const records=await (await request('/api/recordings')).json();
  const remote=records.find(record=>record.id===draft.remoteId);
  if(!remote)throw Error('Gravação do servidor indisponível.');
  const complete=draft.captureComplete!==false;
  const size=draft.partSize??4*1024*1024;
  const count=complete?Math.ceil(draft.blob.size/size):Math.floor(draft.blob.size/size);
  if(remote.state==='ready'){
    if(remote.bytes!==draft.blob.size)throw Error('A versão no servidor difere do rascunho. Preserve sua cópia local.');
    return;
  }
  for(let index=remote.next_chunk;index<count;index++) {
    report('Enviando parte '+(index+1));
    await request('/api/recordings/'+draft.remoteId+'/chunks?number='+index,{
      method:'PUT',body:draft.blob.slice(index*size,(index+1)*size)
    });
  }
  if(complete){
    await request('/api/recordings/'+draft.remoteId+'/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bytes:draft.blob.size,chunks:count})});
    report('Aula salva no servidor.');
    window.dispatchEvent(new Event('academy:remote-updated'));
  }else report('Partes enviadas. A gravação continua.');
}
export function syncDraft(id) {
  const running=pending.get(id);
  if(running){running.again=true;return running.promise;}
  const state={again:true,promise:null};
  state.promise=(async()=>{
    try {
      while(state.again){state.again=false;await transfer(id);}
    }finally{pending.delete(id);}
  })();
  pending.set(id,state);
  return state.promise;
}
