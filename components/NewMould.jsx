'use client';
import ActionGuide from './ActionGuide';
import {useState} from 'react';
import {Button,Field,inputClass} from './ui';
import {createMould} from '../lib/data';
import {Section,Icon} from './Shell';
export default function NewMould({client,profile,customers,t,onCreated,onCancel}){
 const w=t.workflow;
 const [form,setForm]=useState({code:'',name:'',trial:'',priority:'normal',customer:'',customerName:''});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const change=(key,value)=>setForm(f=>({...f,[key]:value}));
 async function submit(e){e.preventDefault();const trial=new FormData(e.currentTarget).get('trial');setBusy(true);setError('');try{const job=await createMould(client,{...form,trial});onCreated(job);}catch(error){if(process.env.NODE_ENV==='development')console.warn('Mould save failed',error.code||'NETWORK');setError(error.code==='23505'?w.duplicateMould:t.invalid);}finally{setBusy(false)}}
 return <section className="space-y-5"><Button onClick={onCancel}><Icon name="back"/>{w.back}</Button><h2 className="page-title">{w.newMould}</h2><ActionGuide t={t} topic="newMould"/><Section title={t.screens.setup} hint={t.screens.setupHint} icon="moulds"><p className="muted">{w.createIntro}</p></Section><form onSubmit={submit} className="space-y-5 panel">
 <Field label={w.mouldCode} hint={w.codeHint}>{id=><input id={id} className={inputClass} value={form.code} onChange={e=>change('code',e.target.value)} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,59}" minLength={2} maxLength={60} required autoCapitalize="characters"/>}</Field>
 <Field label={w.mouldName}>{id=><input id={id} className={inputClass} value={form.name} onChange={e=>change('name',e.target.value)} maxLength={160} required/>}</Field>
 <Field label={w.customer}>{id=><select id={id} className={inputClass} value={form.customer} onChange={e=>change('customer',e.target.value)}><option value="">{w.noCustomer}</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}{['developer','admin'].includes(profile.role)&&<option value="new">{w.newCustomer}</option>}</select>}</Field>
 {form.customer==='new'&&<Field label={w.customerName}>{id=><input id={id} className={inputClass} value={form.customerName} onChange={e=>change('customerName',e.target.value)} maxLength={160} required/>}</Field>}
 <Field label={w.trialDate} hint={w.trialHint}>{id=><input id={id} name="trial" type="date" className={inputClass} value={form.trial} onInput={e=>change('trial',e.currentTarget.value)} onChange={e=>change('trial',e.target.value)} required/>}</Field>
 <p className="state-box muted">{t.screens.trialBuffer}</p>
 <Field label={w.priority}>{id=><select id={id} className={inputClass} value={form.priority} onChange={e=>change('priority',e.target.value)}>{['normal','high','urgent'].map(p=><option key={p} value={p}>{w.priorities[p]}</option>)}</select>}</Field>
 <p role="alert">{error}</p><Button type="submit" primary disabled={busy} className="w-full">{busy?t.loading:w.createMould}</Button>
 </form></section>;
}
