'use client';
import {useEffect,useState} from 'react';
import {Section,StateBox} from './Shell';
import {Button,Field,inputClass} from './ui';
export default function PlanningSettings({client,t}){
 const [values,setValues]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 async function load(){try{const r=await client.from('settings').select('key,value').in('key',['handover_buffer_days','trial_lead_days']).is('archived_at',null);if(r.error)throw r.error;setValues(Object.fromEntries(r.data.map(s=>[s.key,Number(s.value)])));setError('')}catch{setError(t.shell.readError)}}
 useEffect(()=>{load()},[client]);
 async function save(e){e.preventDefault();setBusy(true);setError('');setNotice('');try{const rows=Object.entries(values).map(([key,value])=>({key,value:Number(value),archived_at:null}));const r=await client.from('settings').upsert(rows);if(r.error)throw r.error;setNotice(t.saved);await load()}catch{setError(t.invalid)}finally{setBusy(false)}}
 return <Section title={t.planning.title} hint={t.planning.calendarHint}>{error&&<StateBox error title={error} action={<Button onClick={load}>{t.shell.retry}</Button>}/>} {!values&&!error?<StateBox title={t.loading}/>:values&&<form className="inline-form" onSubmit={save}>{[['handover_buffer_days',t.planning.buffer],['trial_lead_days',t.planning.lead]].map(([key,label])=><Field key={key} label={label}>{id=><input id={id} className={inputClass} type="number" min="0" max="365" step="1" required value={values[key]??''} disabled={busy} onChange={e=>{const value=e.target.value;setValues(old=>({...old,[key]:value}))}}/>}</Field>)}<Button disabled={busy}>{busy?t.loading:t.shell.save}</Button></form>}{notice&&<p role="status" className="notice">{notice}</p>}</Section>;
}
