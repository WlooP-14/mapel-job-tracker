'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {formatRemark} from '../lib/remarks';
import {Section,StateBox} from './Shell';
import {Button,Field,inputClass} from './ui';
export default function MouldRemarks({client,profile,job,t}){
 const p=t.planning;const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[text,setText]=useState('');const request=useRef(null);
 const canEdit=['developer','admin','operator'].includes(profile.role)&&['active','on_hold'].includes(job.status);
 const load=useCallback(async()=>{try{const r=await client.from('mould_remarks').select('id,text,kind,part_name,actor_name,created_by,created_at').eq('job_id',job.id).is('archived_at',null).order('created_at',{ascending:false}).limit(100);if(r.error)throw r.error;setRows(r.data);setError('')}catch{setError(t.shell.readError)}finally{setLoading(false)}},[client,job.id,t.shell.readError]);
 useEffect(()=>{load();let timer;const channel=client.channel('mould-remarks:'+job.id).on('postgres_changes',{event:'*',schema:'public',table:'remarks'},()=>{clearTimeout(timer);timer=setTimeout(load,200)}).subscribe();return()=>{clearTimeout(timer);client.removeChannel(channel)}},[client,job.id,load]);
 async function save(e){e.preventDefault();setBusy(true);try{const id=request.current??=crypto.randomUUID(),r=await client.from('remarks').insert({id,entity_type:'job',entity_id:job.id,text:text.trim(),kind:'manual',created_by:profile.id});if(r.error&&r.error.code!=='23505')throw r.error;setText('');request.current=null;await load()}catch{setError(t.invalid)}finally{setBusy(false)}}
 return <Section title={p.remarks}>{canEdit&&<form className="inline-form" onSubmit={save}><Field label={p.remark}>{id=><textarea id={id} className={inputClass} required maxLength={1000} value={text} disabled={busy} onChange={e=>{request.current=null;setText(e.target.value)}}/>}</Field><Button disabled={busy||!text.trim()}>{busy?t.loading:p.saveRemark}</Button></form>}{error?<StateBox error title={error} action={<Button onClick={load}>{t.shell.retry}</Button>}/>:loading?<StateBox title={t.loading}/>:!rows.length?<p className="mt-3">{p.noRemarks}</p>:rows.map(r=><div className="data-row" key={r.id}><div><p className={['alert','delay'].includes(r.kind)?'font-bold':''}>{formatRemark(r.text,t)}</p>{r.part_name&&<p>{r.part_name}</p>}<p className="muted">{r.actor_name||(r.created_by?p.team:p.system)} · {new Date(r.created_at).toLocaleString()}</p></div></div>)}</Section>;
}
