function open(){return new Promise((resolve,reject)=>{const request=indexedDB.open('mjt-local-drafts',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});}
async function access(key,mode,value){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('drafts');let result;const request=mode==='get'?store.get(key):mode==='delete'?store.delete(key):store.put(value,key);request.onsuccess=()=>{result=request.result};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export const loadDraft=key=>access(key,'get');
export const saveDraft=(key,value)=>access(key,'put',value);
export const removeDraft=key=>access(key,'delete');
