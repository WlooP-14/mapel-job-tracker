'use client';

import {useEffect,useRef,useState} from 'react';
import {scannedMouldCode} from '../lib/box-labels';
import {Button,Field,inputClass} from './ui';
import {Icon,StateBox} from './Shell';

function readFrame(source,width,height,canvas,decode) {
 const scale=Math.min(1,1280/Math.max(width,height));
 canvas.width=Math.max(1,Math.round(width*scale));
 canvas.height=Math.max(1,Math.round(height*scale));
 const context=canvas.getContext('2d',{willReadFrequently:true});
 context.drawImage(source,0,0,canvas.width,canvas.height);
 return decode(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height)?.data;
}

export default function ScanBoxLabel({jobs,t,onBack,onOpen,loading,loadError,onRetry}) {
 const copy=t.boxLabels;
 const video=useRef(null),photo=useRef(null);
 const [camera,setCamera]=useState(false),[live,setLive]=useState(false);
 const [reading,setReading]=useState(false),[value,setValue]=useState('');
 const [result,setResult]=useState(undefined),[error,setError]=useState('');
 const job=result?jobs.find(item=>item.mould_code===result):null;

 useEffect(()=>{
  if(!camera)return;
  let active=true,stream,timer;
  const player=video.current;
  async function start(){
   try{
    const {default:decode}=await import('jsqr');
    if(!active)return;
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});
    if(!active){stream.getTracks().forEach(track=>track.stop());return;}
    player.srcObject=stream;
    await player.play();
    if(!active)return;
    setLive(true);
    const canvas=document.createElement('canvas');
    timer=setInterval(()=>{
     if(!player.videoWidth||!player.videoHeight)return;
     const text=readFrame(player,player.videoWidth,player.videoHeight,canvas,decode);
     if(text){setResult(scannedMouldCode(text));setCamera(false);}
    },180);
   }catch{if(active){setError('cameraError');setCamera(false);}}
  }
  start();
  return ()=>{active=false;clearInterval(timer);stream?.getTracks().forEach(track=>track.stop());player.srcObject=null;};
 },[camera]);

 async function readPhoto(event){
  const file=event.currentTarget.files?.[0];
  event.currentTarget.value='';
  if(!file)return;
  setError('');setResult(undefined);setReading(true);
  let url;
  try{
   if(file.size>15*1024*1024)throw new Error('image size');
   const {default:decode}=await import('jsqr');
   url=URL.createObjectURL(file);
   const image=new Image();image.src=url;await image.decode();
   const text=readFrame(image,image.naturalWidth,image.naturalHeight,document.createElement('canvas'),decode);
   if(!text)throw new Error('no QR');
   setResult(scannedMouldCode(text));
  }catch{setError('photoError');}
  finally{if(url)URL.revokeObjectURL(url);setReading(false);}
 }

 return <section className="space-y-4">
  <Button type="button" onClick={onBack}><Icon name="back"/>{t.workflow.back}</Button>
  <h2 className="page-title">{copy.scan}</h2><p>{copy.scanHint}</p>
  {camera?<div className="space-y-3"><video ref={video} muted playsInline className="w-full rounded-lg border"/>{!live&&<StateBox title={t.loading}/>}<Button onClick={()=>setCamera(false)}>{copy.stop}</Button></div>:<div className="flex flex-wrap gap-3">
   <Button primary disabled={reading} onClick={()=>{setError('');setResult(undefined);setLive(false);setCamera(true);}}>{copy.camera}</Button>
   <input type="file" accept="image/*" ref={photo} onChange={readPhoto} hidden/>
   <Button disabled={reading} onClick={()=>photo.current?.click()}>{copy.photo}</Button>
  </div>}
  {!camera&&<form className="space-y-3" onSubmit={event=>{event.preventDefault();setError('');setResult(scannedMouldCode(value));}}>
   <Field label={copy.code}>{id=><input id={id} className={inputClass} required maxLength={60} value={value} onChange={event=>setValue(event.target.value)}/>}</Field>
   <Button type="submit" disabled={reading}>{copy.find}</Button>
  </form>}
  {reading&&<StateBox title={t.loading}/>}
  {error&&<StateBox error title={copy[error]}/>}
  {result===null&&<StateBox error title={copy.invalid}/>}
  {result&&(loadError?<StateBox error title={loadError} action={<Button onClick={onRetry}>{t.workflow.retry}</Button>}/>:loading?<StateBox title={t.loading}/>:job?<div className="panel space-y-3" role="status"><h3>{job.mould_code}</h3><p>{job.name}</p><Button primary onClick={()=>onOpen(job)}>{copy.open}</Button></div>:<StateBox title={copy.notFound}/>)}
 </section>;
}
