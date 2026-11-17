function database() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('academy-studio',2);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains('drafts'))request.result.createObjectStore('drafts',{keyPath:'id'});
      if(!request.result.objectStoreNames.contains('labels'))request.result.createObjectStore('labels',{keyPath:'id'});
      if(!request.result.objectStoreNames.contains('captureChunks'))request.result.createObjectStore('captureChunks',{keyPath:['draftId','index']});
    };
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>resolve(request.result);
  });
}
const range=id=>IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER]);
export async function drafts(action,value) {
  const db=await database();
  try {
    return await new Promise((resolve,reject)=>{
      const write=['save','append','patch'].includes(action);
      const tx=db.transaction(['drafts','labels','captureChunks'],write?'readwrite':'readonly',{durability:write?'strict':'default'});
      const records=tx.objectStore('drafts');
      const labels=tx.objectStore('labels');
      const chunks=tx.objectStore('captureChunks');
      let result;
      function put(draft) {
        records.put(draft);
        const {blob,...metadata}=draft;
        labels.put(metadata);
        result=draft;
      }
      if(action==='save') {
        put(value);
        chunks.delete(range(value.id));
      }else if(action==='list') {
        labels.getAll().onsuccess=event=>{result=event.target.result;};
      }else {
        const id=typeof value==='string'?value:value.id;
        records.get(id).onsuccess=event=>{
          const draft=event.target.result;
          if(!draft){tx.abort();return;}
          if(action==='append') {
            const index=draft.localChunks??0;
            chunks.put({draftId:id,index,blob:value.blob});
            put({...draft,mime:draft.mime||value.blob.type,localChunks:index+1,bytes:(draft.bytes??0)+value.blob.size});
          }else if(action==='patch') {
            // Only mutable sync metadata may change, never the captured payload/counters.
            put({...draft,...value.changes});
          }else if(action==='get') {
            if(draft.blob){result=draft;return;}
            chunks.getAll(range(id)).onsuccess=event=>{
              result={...draft,blob:new Blob(event.target.result.map(part=>part.blob),{type:draft.mime})};
            };
          }else tx.abort();
        };
      }
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(tx.error??new Error('Rascunho indisponível'));
      tx.onerror=()=>{};
    });
  }finally{db.close();}
}
