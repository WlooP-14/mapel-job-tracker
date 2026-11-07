'use client';

import {useEffect,useState} from 'react';
import {boxLabelValue} from '../lib/box-labels';
import {Button,Field,inputClass} from './ui';
import {Icon,StateBox} from './Shell';

export default function BoxLabels({job,t,onBack}) {
 const [quantity,setQuantity]=useState(1);
 const [image,setImage]=useState(null);
 const [failed,setFailed]=useState(false);
 const copy=t.boxLabels;
 const count=Number(quantity);
 const valid=Number.isInteger(count)&&count>=1&&count<=96;

 useEffect(()=>{
  let current=true;
  import('qrcode').then(({default:qr})=>qr.toDataURL(boxLabelValue(job.mould_code),{errorCorrectionLevel:'M',scale:8})).then(url=>{
   if(current)setImage(url);
  }).catch(()=>{if(current)setFailed(true);});
  return ()=>{current=false;};
 },[job.mould_code]);

 return <section className="box-label-screen space-y-4">
  <div className="box-label-controls space-y-4">
   <Button type="button" onClick={onBack}><Icon name="back"/>{t.workflow.back}</Button>
   <h2 className="page-title">{copy.title}</h2>
   <p>{copy.printHint}</p>
   <form className="space-y-4" onSubmit={event=>{event.preventDefault();if(valid&&image)window.print();}}>
    <Field label={copy.quantity}>{id=><input id={id} className={inputClass} type="number" min="1" max="96" step="1" required value={quantity} onChange={event=>setQuantity(event.target.value)}/>}</Field>
    <Button type="submit" primary className="w-full" disabled={!image||!valid}>{copy.print}</Button>
   </form>
   {failed?<StateBox error title={copy.printError}/>:!image&&<StateBox title={t.loading}/>}
  </div>
  {image&&valid&&<div className="box-label-sheet">{Array.from({length:count},(_,index)=><article className="box-label" key={index}>
   <img src={image} alt={copy.qrAlt} width="144" height="144"/>
   <strong>{job.mould_code}</strong><p>{job.name}</p>
  </article>)}</div>}
 </section>;
}
