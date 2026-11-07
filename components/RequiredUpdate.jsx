'use client';

import {useEffect,useRef,useState} from 'react';
import {Button} from './ui';

export default function RequiredUpdate({t}){
 const [required,setRequired]=useState(false);
 const dialog=useRef(null);
 const copy=t.appUpdate;

 useEffect(()=>{
  if(process.env.NODE_ENV!=='production'||required)return;
  let request;
  async function check(){
   if(request||document.visibilityState!=='visible'||!navigator.onLine)return;
   const controller=new AbortController();
   request=controller;
   try{
    const response=await fetch('/api/version',{cache:'no-store',signal:controller.signal});
    if(!response.ok)return;
    const {version}=await response.json();
    if(!controller.signal.aborted&&version&&version!==process.env.MJT_RELEASE_VERSION)setRequired(true);
   }catch{/* Check again when the connection or app returns. */}
   finally{request=null;}
  }
  check();
  const timer=setInterval(check,60000);
  document.addEventListener('visibilitychange',check);
  window.addEventListener('online',check);
  window.addEventListener('pageshow',check);
  return ()=>{
   clearInterval(timer);
   document.removeEventListener('visibilitychange',check);
   window.removeEventListener('online',check);
   window.removeEventListener('pageshow',check);
   request?.abort();
  };
 },[required]);

 useEffect(()=>{
  if(required&&!dialog.current.open)dialog.current.showModal();
 },[required]);

 if(!required)return null;
 return <dialog ref={dialog} className="tour-dialog" aria-labelledby="update-title" aria-describedby="update-message" onCancel={event=>event.preventDefault()}>
  <h2 id="update-title">{copy.title}</h2>
  <p id="update-message" className="my-4">{copy.message}</p>
  <Button primary className="w-full" onClick={()=>window.location.reload()}>{copy.action}</Button>
 </dialog>;
}
