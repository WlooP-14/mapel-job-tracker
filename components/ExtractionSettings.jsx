'use client';
import {useEffect,useState} from 'react';
import {Section,StateBox} from './Shell';
import {Button,Field,inputClass} from './ui';
export default function ExtractionSettings({client,t}){
 const g=t.gemini;
 const [provider,setProvider]=useState('manual'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function load(){setLoading(true);setError('');try{const r=await client.from('settings').select('value').eq('key','bom_extraction_provider').is('archived_at',null).maybeSingle();if(r.error)throw r.error;setProvider(r.data?.value==='gemini'?'gemini':'manual');}catch{setError(t.shell.readError)}finally{setLoading(false)}}
 useEffect(()=>{load()},[client]);
 async function save(e){e.preventDefault();setBusy(true);setError('');setNotice('');try{const r=await client.from('settings').upsert({key:'bom_extraction_provider',value:provider,archived_at:null});if(r.error)throw r.error;setNotice(t.saved);}catch{setError(t.invalid)}finally{setBusy(false)}}
 return <Section title={g.settings} hint={g.hint}>{loading?<StateBox title={t.loading}/>:<>{error&&<StateBox error title={error} action={<Button onClick={load}>{t.shell.retry}</Button>}/>}<form onSubmit={save} className="inline-form"><Field label={g.provider}>{id=><select id={id} className={inputClass} disabled={busy} value={provider} onChange={e=>setProvider(e.target.value)}><option value="manual">{g.manual}</option><option value="gemini">{g.gemini}</option></select>}</Field><Button disabled={busy||Boolean(error)}>{busy?t.loading:t.shell.save}</Button></form>{notice&&<p role="status" className="notice">{notice}</p>}</>}</Section>;
}
