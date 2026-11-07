'use client';
import {useState} from 'react';
import {CATEGORIES,parseSize,sizeWarnings} from '../lib/bom';
import {addPart} from '../lib/data';
import {Button,Field,inputClass} from './ui';
export default function AddPart({client,job,category,parts,t,onAdded,onCancel}){
 const w=t.workflow;const [id]=useState(()=>crypto.randomUUID());
 const [form,setForm]=useState({category,name:'',material:'',qty:'1',finish:'',rough:'',size:'',remark:'',twoD:false});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const change=(key,value)=>setForm(f=>({...f,[key]:value}));const hardware=form.category==='hardware';
 const warnings=hardware?[]:sizeWarnings(form.finish,form.rough);
 const duplicate=parts.some(p=>p.category===form.category&&p.name.trim().toLowerCase()===form.name.trim().toLowerCase());
 async function submit(e){e.preventDefault();setBusy(true);setError('');try{
  await addPart(client,job.id,{id,category:form.category,name:form.name,material:form.material,qty_required:Number(form.qty),finish_size_text:hardware?null:form.finish,rough_size_text:hardware?null:form.rough,finish_dims:hardware?null:parseSize(form.finish),rough_dims:hardware?null:parseSize(form.rough),size_text:hardware?form.size:null,remark:hardware?form.remark:null,two_d_submitted:form.twoD});onAdded(form.category);
 }catch{setError(t.invalid)}finally{setBusy(false)}}
 return <section className="space-y-5"><Button onClick={onCancel}>{w.back}</Button><h2 className="text-[28px] font-bold">{w.addPart}</h2><p className="font-bold">{job.mould_code}</p><form onSubmit={submit} className="space-y-5 rounded-[8px] border border-[var(--border)] p-4">
 <Field label={w.section}>{fieldId=><select id={fieldId} className={inputClass} value={form.category} onChange={e=>change('category',e.target.value)}>{CATEGORIES.map((c,i)=><option key={c} value={c}>{t.tabs[i]}</option>)}</select>}</Field>
 <Field label={w.partName}>{fieldId=><input id={fieldId} className={inputClass} value={form.name} onChange={e=>change('name',e.target.value)} maxLength={160} required/>}</Field>
 <Field label={w.material}>{fieldId=><><input id={fieldId} list="known-materials" className={inputClass} value={form.material} onChange={e=>change('material',e.target.value)} maxLength={80}/><datalist id="known-materials">{[...new Set(parts.map(p=>p.material).filter(Boolean))].map(m=><option key={m} value={m}/>)}</datalist></>}</Field>
 <Field label={w.quantity}>{fieldId=><input id={fieldId} type="number" inputMode="decimal" min="0.001" step="any" className={inputClass} value={form.qty} onChange={e=>change('qty',e.target.value)} required/>}</Field>
 {hardware?<><Field label={w.size}>{fieldId=><input id={fieldId} className={inputClass} value={form.size} onChange={e=>change('size',e.target.value)} maxLength={160}/>}</Field><Field label={w.usedAt}>{fieldId=><input id={fieldId} className={inputClass} value={form.remark} onChange={e=>change('remark',e.target.value)} maxLength={300}/>}</Field></>:<><Field label={w.finishSize} hint={w.sizeHint}>{fieldId=><input id={fieldId} className={inputClass} value={form.finish} onChange={e=>change('finish',e.target.value)} maxLength={160}/>}</Field><Field label={w.roughSize}>{fieldId=><input id={fieldId} className={inputClass} value={form.rough} onChange={e=>change('rough',e.target.value)} maxLength={160}/>}</Field></>}
 <label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={form.twoD} onChange={e=>change('twoD',e.target.checked)} className="h-6 w-6 accent-[var(--red)]"/>{w.twoD}</label>
 {(duplicate||warnings.length>0)&&<div className="space-y-2 rounded-[8px] border border-[var(--border)] p-3" role="note"><strong>{w.checkBeforeSave}</strong>{duplicate&&<p>{w.warnings.duplicate}</p>}{warnings.map(key=><p key={key}>{w.warnings[key]}</p>)}</div>}
 <p className="text-[var(--muted)]">{hardware?w.hardwareHint:w.stepsHint}</p><p role="alert">{error}</p><Button primary disabled={busy} type="submit" className="w-full">{busy?t.loading:w.confirmPart}</Button>
 </form></section>;
}
