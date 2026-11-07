'use client';
import {useCallback,useEffect,useState} from 'react';
import {CATEGORIES} from '../lib/bom';
import {loadParts} from '../lib/data';
import {Button,HelpHint} from './ui';
import {StateBox,Icon,Section} from './Shell';
import {CategoryTabs,PartCard,Readiness,partStatus} from './MouldCards';
import AddPart from './AddPart';
import BomReview from './BomReview';
import BomUpload from './BomUpload';
import {loadDraft} from '../lib/drafts';
import BomFiles from './BomFiles';
import EditMould from './EditMould';
import Receiving from './Receiving';
import Planning from './Planning';
import MouldRemarks from './MouldRemarks';
import Trials from './Trials';
import BoxLabels from './BoxLabels';
import PartHistory from './PartHistory';
export default function MouldDetail({client,profile,job,customer,customers=[],t,onBack,onUpdated}){
 const w=t.workflow;const [category,setCategory]=useState('turn'),[parts,setParts]=useState([]),[revisions,setRevisions]=useState([]),[changes,setChanges]=useState([]),[adding,setAdding]=useState(false),[editing,setEditing]=useState(false),[receiving,setReceiving]=useState(false),[reviewing,setReviewing]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const canEdit=['developer','admin','operator'].includes(profile.role)&&['active','on_hold'].includes(job.status);
 const [uploading,setUploading]=useState(false);
 const [hasLegacyDraft,setHasLegacyDraft]=useState(false);
 const [planning,setPlanning]=useState(false);
 const [trials,setTrials]=useState(false);
 const [labels,setLabels]=useState(false);
 const [showHistory,setShowHistory]=useState(false);
 useEffect(()=>{window.scrollTo(0,0)},[job.id,adding,editing,receiving,reviewing,uploading,planning,trials,labels]);
 useEffect(()=>{const last=localStorage.getItem(`mjt-tab:${profile.id}:${job.id}`);if(CATEGORIES.includes(last))setCategory(last);},[profile.id,job.id]);
 const reload=useCallback(async()=>{try{const [items,history,jobChanges]=await Promise.all([loadParts(client,job.id),client.from('bom_revisions').select('id,revision_no,reason,at').eq('job_id',job.id).is('archived_at',null).order('revision_no',{ascending:false}).limit(5),client.from('job_date_history').select('id,field,old_value,new_value,reason,at').eq('job_id',job.id).order('at',{ascending:false}).limit(10)]);if(history.error)throw history.error;if(jobChanges.error)throw jobChanges.error;setChanges(jobChanges.data||[]);setParts(items);setRevisions(history.data||[]);setError('');}catch{setError(t.shell.readError)}finally{setLoading(false)}},[client,job.id,t.shell.readError]);
 useEffect(()=>{let alive=true,timer;const changed=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(alive)reload()},200)};reload();const channel=client.channel(`mould:${job.id}:${profile.id}`).on('postgres_changes',{event:'*',schema:'public',table:'bom_items',filter:`job_id=eq.${job.id}`},changed).on('postgres_changes',{event:'*',schema:'public',table:'part_steps'},changed).on('postgres_changes',{event:'*',schema:'public',table:'bom_revisions',filter:`job_id=eq.${job.id}`},changed).subscribe();return()=>{alive=false;clearTimeout(timer);client.removeChannel(channel);};},[client,job.id,profile.id,reload]);
 useEffect(()=>{
  let current=true;
  loadDraft('bom:'+profile.id+':'+job.id).then(draft=>{if(current)setHasLegacyDraft(Boolean(draft));}).catch(()=>{});
  return()=>{current=false;};
 },[profile.id,job.id,reviewing]);
 function choose(c){setCategory(c);localStorage.setItem(`mjt-tab:${profile.id}:${job.id}`,c);}
 if(adding&&canEdit)return <AddPart client={client} job={job} category={category} parts={parts} t={t} onCancel={()=>setAdding(false)} onAdded={c=>{choose(c);setAdding(false);setNotice(w.partSaved);reload();onUpdated();}}/>;
 if(receiving)return <Receiving client={client} profile={profile} job={job} t={t} onBack={()=>{setReceiving(false);reload()}} onUpdated={onUpdated}/>;
 if(planning)return <Planning client={client} profile={profile} job={job} t={t} onBack={()=>{setPlanning(false);reload()}} onReceiving={()=>setReceiving(true)} onUpdated={onUpdated}/>;
 if(trials)return <Trials client={client} profile={profile} job={job} t={t} onBack={()=>{setTrials(false);reload()}} onUpdated={onUpdated}/>;
 if(labels)return <BoxLabels job={job} t={t} onBack={()=>setLabels(false)}/>;
 if(editing&&canEdit)return <EditMould client={client} job={job} customers={customers} t={t} onBack={()=>setEditing(false)} onSaved={()=>{setEditing(false);setNotice(t.editMould.saved);onUpdated();reload();}}/>;
 if(uploading&&canEdit)return <BomUpload client={client} job={job} t={t} onBack={()=>setUploading(false)} onSaved={()=>{setUploading(false);setNotice(t.bom.filesSaved);}}/>;
 if(reviewing&&canEdit)return <BomReview client={client} profile={profile} job={job} parts={parts} t={t} initialSource={reviewing===true?null:reviewing} onBack={()=>setReviewing(false)} onFileSaved={async()=>{await reload();onUpdated();}} onSaved={(message)=>{setReviewing(false);setNotice(message||t.bom.saved);reload();onUpdated();}}/>;
 const completed=[],openParts=[];
 let applicable=0;
 for(const part of parts){
  const status=partStatus(part.part_steps);
  if(status!==4)applicable++;
  (status===0?completed:openParts).push(part);
 }
 const shown=openParts.filter(p=>p.category===category),ready=completed.length;
 const locale=Object.keys(t.languages).includes(document.documentElement.lang)?document.documentElement.lang:'en';
 const date=value=>value?new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',year:'numeric'}).format(new Date(value+'T12:00:00')):w.notSet;
 return <section className="space-y-5"><Button onClick={onBack}><Icon name="back"/>{w.backToMoulds}</Button><div className="section-heading"><h2 className="page-title">{job.mould_code}</h2>{profile.role==='viewer'&&<span className="plain-badge">{t.screens.readOnly}</span>}</div><section className="panel mould-card"><div className="section-heading"><div><p className="muted">{w.customer}</p><h3>{customer||w.noCustomer}</h3></div><span className="plain-badge">{w.priorities[job.priority]}</span></div><p className="font-bold text-xl">{job.name}</p><p className="date-line"><Icon name="clock"/><strong>{w.trialDate}:</strong> {date(job.trial_date_t0)}</p><p className="muted">{w.states[job.status]}</p><Readiness ready={ready} total={applicable} t={t}/></section>
 {canEdit&&<Button className="w-full" onClick={()=>setEditing(true)}>{t.editMould.title}</Button>}
 {canEdit&&<Button primary className="w-full" onClick={()=>setUploading(true)}><Icon name="plus"/>{t.bom.addBom}</Button>}
 {notice&&<p role="status" className="notice">{notice}</p>}
 <BomFiles client={client} job={job} t={t} version={revisions[0]?.id} onUseFile={canEdit&&!loading&&!error?setReviewing:null}/>
 {canEdit&&!loading&&!error&&hasLegacyDraft&&<Button className="w-full" onClick={()=>setReviewing(true)}>{t.bom.resumeReview}</Button>}
 {!loading&&!error&&canEdit&&!parts.length&&<p className="muted">{t.bom.partsNeeded}</p>}
 <Button className="w-full" onClick={()=>setReceiving(true)}><Icon name="receive"/>{t.receiving.title}</Button>
 <Button className="w-full" onClick={()=>setLabels(true)}>{t.boxLabels.title}</Button>
 <Button className="w-full" onClick={()=>setPlanning(true)}><Icon name="moulds"/>{t.planning.title}</Button>
 <Button className="w-full" onClick={()=>setTrials(true)}><Icon name="check"/>{t.trials.title}</Button>
 <div className="flex flex-wrap items-center justify-between gap-3"><h3>{w.parts}<HelpHint label={t.hint} text={w.partsHint} close={t.close}/></h3>{canEdit&&<Button onClick={()=>setAdding(true)}><Icon name="plus"/>{w.addPart}</Button>}</div><div className="flex flex-wrap gap-3"><Button aria-pressed={!showHistory} onClick={()=>setShowHistory(false)}>{t.partHistory.open}</Button><Button aria-pressed={showHistory} onClick={()=>setShowHistory(true)}>{t.partHistory.title} ({ready})</Button></div>{!showHistory&&<CategoryTabs category={category} onChange={choose} parts={openParts} t={t}/>}

 {showHistory?(error?<StateBox error title={error} action={<Button onClick={reload}>{w.retry}</Button>}/>:loading?<StateBox title={t.loading}/>:completed.length?<PartHistory client={client} job={job} parts={completed} t={t}/>:<StateBox title={t.partHistory.empty}/>):<div role="tabpanel" id="part-panel" aria-labelledby={`tab-${category}`} className="space-y-4"><div className="section-heading"><h3>{t.tabs[CATEGORIES.indexOf(category)]}</h3><span className="muted">{t.screens.partCount.replace('{count}',shown.length)}</span></div>{error?<StateBox error title={error} action={<Button onClick={reload}>{w.retry}</Button>}/>:loading?<StateBox title={t.loading}/>:!shown.length?<StateBox title={parts.length?t.partHistory.noOpen:w.noParts} detail={parts.length?undefined:canEdit?w.noPartsEdit:w.noPartsRead}/>:shown.map(part=><PartCard key={part.id} part={part} t={t}/>)}</div>}
 {revisions.length>0&&<Section title={w.bomHistory} hint={w.historyHint}>{revisions.map(r=><p key={r.id} className="data-row">{w.revision} {r.revision_no} · {new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(r.at))}</p>)}</Section>}
 {changes.length>0&&<Section title={t.editMould.history}>{changes.map(change=>{const value=v=>change.field==='priority'?w.priorities[v]||v:change.field==='status'?w.states[v]||v:change.field==='customer_id'?customers.find(c=>c.id===v)?.name||w.noCustomer:v||w.notSet;return <div className="data-row" key={change.id}><div><strong>{t.editMould.fields[change.field]||t.editMould.title}</strong><p>{value(change.old_value)} → {value(change.new_value)}</p><p className="muted">{change.reason}</p><p className="muted">{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(change.at))}</p></div></div>})}</Section>}
 
 <MouldRemarks client={client} profile={profile} job={job} t={t}/>
 </section>;
}
