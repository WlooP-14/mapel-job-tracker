'use client';

import {useCallback,useEffect,useState} from 'react';
import {paged} from '../lib/planning';
import {Button,Field,inputClass} from './ui';
import {Section,StateBox} from './Shell';

export default function ProcessSettings({client,t,onSaved}){
 const copy=t.processes;
 const [form,setForm]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [stages,setStages]=useState([]),[loading,setLoading]=useState(true),[readError,setReadError]=useState(false);
 const load=useCallback(async()=>{
  setReadError(false);
  try{
   const rows=await paged(()=>client.from('step_templates').select('*').is('archived_at',null).eq('active',true).order('order_no').order('id'));
   setStages(rows);
  }catch{setReadError(true);}
  finally{setLoading(false);}
 },[client]);
 useEffect(()=>{load();},[load]);
 const processes=stages.filter(stage=>stage.category!=='hardware'&&stage.step_name!=='Received');
 function begin(stage){
  setError('');setNotice('');
  setForm(stage?{...stage,default_days:stage.default_days??'',existing:true}:{id:crypto.randomUUID(),category:'turn',step_name:'',default_days:'',order_no:processes.filter(item=>item.category==='turn').reduce((max,item)=>Math.max(max,item.order_no),0)+1,default_selected:false});
 }
 function field(name,value){setForm(old=>({...old,[name]:value}));}
 async function save(event){
  event.preventDefault();setBusy(true);setError('');
  try{
   const result=await client.rpc('save_processing_step',{p_id:form.id,p_category:form.category,p_name:form.step_name.trim(),p_days:Number(form.default_days),p_order:Number(form.order_no),p_default:form.default_selected});
   if(result.error)throw result.error;
   setForm(null);setNotice(t.saved);await load();await onSaved();
  }catch(failure){setError(failure?.message?.includes('PROCESS_NAME_EXISTS')?copy.exists:t.invalid);}
  finally{setBusy(false);}
 }
 if(loading)return <StateBox title={t.loading}/>;
 if(readError)return <StateBox error title={t.shell.readError} action={<Button onClick={load}>{t.workflow.retry}</Button>}/>;
 return <Section title={copy.title} hint={copy.hint}>
  {notice&&<p className="notice" role="status">{notice}</p>}
  {error&&<StateBox error title={error}/>}
  {processes.map(stage=><div className="data-row flex-wrap" key={stage.id}>
   <div className="details"><strong>{t.stageNames[stage.step_name]||stage.step_name}</strong><p>{t.tabs[['base','child','turn'].indexOf(stage.category)]} · {copy.order} {stage.order_no}</p></div>
   <Button disabled={busy} onClick={()=>begin(stage)}>{t.shell.edit}</Button>
  </div>)}
  {!form?<Button className="w-full mt-4" onClick={()=>begin()}>{copy.add}</Button>:<form className="inline-form" onSubmit={save}>
   <Field label={t.workflow.section}>{id=><select id={id} className={inputClass} value={form.category} disabled={busy||form.existing} onChange={event=>{const category=event.target.value;setForm(old=>({...old,category,order_no:processes.filter(item=>item.category===category).reduce((max,item)=>Math.max(max,item.order_no),0)+1}));}}>{['base','child','turn'].map((category,index)=><option key={category} value={category}>{t.tabs[index]}</option>)}</select>}</Field>
   <Field label={copy.name}>{id=><input id={id} className={inputClass} required maxLength={80} readOnly={form.existing} disabled={busy} value={form.step_name} onChange={event=>field('step_name',event.target.value)}/>}</Field>
   <Field label={t.stageDays}>{id=><input id={id} className={inputClass} type="number" min="0" max="365" step="1" required disabled={busy} value={form.default_days} onChange={event=>field('default_days',event.target.value)}/>}</Field>
   <Field label={copy.order} hint={copy.orderHint}>{id=><input id={id} className={inputClass} type="number" min="1" max="999" step="1" required disabled={busy} value={form.order_no} onChange={event=>field('order_no',event.target.value)}/>}</Field>
   <label className="check-row"><input type="checkbox" disabled={busy} checked={form.default_selected!==false} onChange={event=>field('default_selected',event.target.checked)}/>{copy.selected}</label>
   <div className="flex flex-wrap gap-3"><Button type="button" disabled={busy} onClick={()=>setForm(null)}>{t.shell.cancel}</Button><Button primary disabled={busy}>{busy?t.loading:t.shell.save}</Button></div>
  </form>}
 </Section>;
}
