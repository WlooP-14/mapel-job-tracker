'use client';

import {useEffect,useState} from 'react';
import {paged} from '../lib/planning';
import {formatRemark} from '../lib/remarks';
import {Button,Field,inputClass} from './ui';
import {PartCard} from './MouldCards';
import {StateBox} from './Shell';

export default function PartHistory({client,job,parts,t}) {
 const copy=t.partHistory;
 const [search,setSearch]=useState(''),[history,setHistory]=useState(null),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let current=true;
  setFailed(false);
  Promise.all([
   paged(()=>client.from('vendors').select('id,name').order('id')),
   paged(()=>client.from('mould_remarks').select('id,entity_type,entity_id,text').eq('job_id',job.id).is('archived_at',null).order('created_at',{ascending:false}).order('id'))
  ]).then(([vendors,remarks])=>{
   if(!current)return;
   const byEntity=new Map();
   for(const remark of remarks){
    const key=remark.entity_type+':'+remark.entity_id;
    if(!byEntity.has(key))byEntity.set(key,[]);
    byEntity.get(key).push(remark);
   }
   setHistory({vendors:new Map(vendors.map(v=>[v.id,v.name])),byEntity});
  }).catch(()=>{if(current)setFailed(true);});
  return ()=>{current=false;};
 },[client,job.id,retry]);

 if(failed)return <StateBox error title={t.shell.readError} action={<Button onClick={()=>setRetry(value=>value+1)}>{t.workflow.retry}</Button>}/>;
 if(!parts.length)return <StateBox title={copy.empty}/>;
 if(!history)return <StateBox title={t.loading}/>;

 const rows=parts.map(part=>{
  const stages=part.part_steps.filter(stage=>stage.status==='DONE');
  const receipt=stages.find(stage=>stage.step_name==='Received');
  const received=receipt?.started_on||receipt?.done_on;
  const completed=stages.map(stage=>stage.done_on).filter(Boolean).sort().at(-1);
  const days=received&&completed&&completed>=received?(Date.parse(completed)-Date.parse(received))/86400000:null;
  const vendors=[...new Set(stages.map(stage=>history.vendors.get(stage.vendor_id)).filter(Boolean))];
  const keys=new Set([`part:${part.id}`,`bom_item:${part.id}`]);
  for(const stage of stages){keys.add(`step:${stage.id}`);if(stage.batch_id)keys.add(`batch:${stage.batch_id}`);}
  const notes=[...keys].flatMap(key=>(history.byEntity.get(key)||[]).map(remark=>formatRemark(remark.text,t)));
  if(part.remark)notes.unshift(part.remark);
  return {part,received,completed,days,vendors,notes};
 }).filter(({part,vendors,notes})=>[part.name,part.material,part.serial_no,...vendors,...notes].join(' ').toLowerCase().includes(search.trim().toLowerCase()))
  .sort((a,b)=>(b.completed||'').localeCompare(a.completed||'')||a.part.serial_no-b.part.serial_no);

 return <div className="space-y-4">
  <Field label={copy.search}>{id=><input id={id} type="search" className={inputClass} value={search} onChange={event=>setSearch(event.target.value)}/>}</Field>
  {!rows.length&&<StateBox title={copy.noMatch}/>}
  {rows.map(({part,received,completed,days,vendors,notes})=><div key={part.id} className="panel space-y-3">
   <PartCard part={part} t={t}/>
   <dl className="part-dimensions">
    {[[copy.received,received],[copy.completed,completed],[copy.days,days],[copy.vendors,vendors.join(', ')]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value===0?0:value||t.workflow.notSet}</dd></div>)}
   </dl>
   {notes.length>0&&<details><summary>{t.planning.remarks}</summary><ul>{notes.map((note,index)=><li key={index} className="data-row">{note}</li>)}</ul></details>}
  </div>)}
 </div>;
}
