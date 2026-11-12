export const appearanceOptions=['light','dark','system'];
export const validAppearance=value=>appearanceOptions.includes(value);
export const resolvedAppearance=(value,systemDark)=>value==='dark'||value==='system'&&systemDark?'dark':'light';
export const appearanceKey=userId=>'mjt-appearance:'+(userId||'guest');

export function readAppearance(storage,userId,remote){
 let local;
 try{local=JSON.parse(storage.getItem(appearanceKey(userId)));}catch{/* Device storage can be unavailable. */}
 if(local?.pending&&validAppearance(local.value))return local;
 return {value:validAppearance(remote)?remote:validAppearance(local?.value)?local.value:'light',pending:false};
}
export function storeAppearance(storage,userId,value,pending=false){
 if(!validAppearance(value))return false;
 try{storage.setItem(appearanceKey(userId),JSON.stringify({value,pending}));return true;}catch{return false;}
}

export function applyAppearance(document,value,systemDark){
 const theme=resolvedAppearance(value,systemDark);
 document.documentElement.dataset.theme=theme;
 document.documentElement.style.colorScheme=theme;
 let meta=document.querySelector('meta[name="theme-color"]');
 if(!meta){meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta);}
 meta.content=theme==='dark'?'#111318':'#ffffff';
}
