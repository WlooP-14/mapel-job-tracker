'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {adminEntities,canManageData,changedAdminFields} from '../lib/admin-records';
import {paged} from '../lib/planning';
import {formatRemark} from '../lib/remarks';
import {Section,StateBox} from './Shell';
import {Button,Field,inputClass} from './ui';

const label=(t,path)=>path.split('.').reduce((value,key)=>value?.[key],t);
export default function AdminDataManager({client,profile,t,job,onChanged}){
 const a=t.admin;
 const [open,setOpen]=useState(false),[entity,setEntity]=useState('jobs'),[jobId,setJobId]=useState(job?.id||''),[deleted,setDeleted]=useState(false),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[rows,setRows]=useState([]),[more,setMore]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[selection,setSelection]=useState(null),[form,setForm]=useState({}),[reason,setReason]=useState(''),[confirmation,setConfirmation]=useState(''),[accepted,setAccepted]=useState(false),[choices,setChoices]=useState({jobs:[],vendors:[],customers:[]});
 const revision=useRef(0),formTarget=useRef(null);
 const allowed=canManageData(profile.role);
 const explain=useCallback(failure=>{
  const message=failure?.message||'';
  if(failure?.code==='PGRST202')return a.setupMissing;
  if(failure?.code==='23505')return a.duplicate;
  if(message.includes('RECORD_CHANGED'))return a.stale;
  if(message.includes('REOPEN_MOULD_FIRST'))return a.reopen;
  if(message.includes('PROTECTED_ACCOUNT'))return a.protected;
  if(message.includes('WORKFLOW'))return a.workflow;
  if(/IN_USE|HAS_WORK|HAS_NEW_WORK|QUANTITY_WITH_PROGRESS|PART_HAS_WORK/.test(message))return a.dependencies;
  return a.invalid;
 },[a]);
 const load=useCallback(async(append=false)=>{
  if(!open||!allowed)return;
  const version=++revision.current;setLoading(true);setError('');
  try{
   const offset=append?rows.length:0;
   const r=await client.rpc('admin_list_records',{p_table:entity,p_job:adminEntities[entity].job?jobId||null:null,p_deleted:deleted,p_search:query,p_offset:offset});
   if(r.error)throw r.error;
   if(version!==revision.current)return;
   setRows(previous=>append?[...previous,...r.data.rows.slice(0,50)]:r.data.rows.slice(0,50));setMore(r.data.more);
  }catch(failure){if(version===revision.current){setRows([]);setError(explain(failure));}}
  finally{if(version===revision.current)setLoading(false);}
 },[client,open,allowed,entity,jobId,deleted,query,explain,rows.length]);
 useEffect(()=>{load();return()=>{revision.current++}},[open,entity,jobId,deleted,query,allowed]);
 useEffect(()=>{if(!open||!allowed)return;let active=true;Promise.all(['jobs','vendors','customers'].map(async table=>[table,await paged(()=>client.from(table).select(table==='jobs'?'id,name,mould_code':'id,name').is('archived_at',null).order('id'))])).then(entries=>{if(active)setChoices(Object.fromEntries(entries))}).catch(()=>{});return()=>{active=false}},[client,open,allowed]);
 useEffect(()=>{if(selection)formTarget.current?.scrollIntoView({behavior:'smooth',block:'start'})},[selection]);
 if(!allowed)return null;
 function begin(record,action){
  setSelection({record,action});setForm(Object.fromEntries(adminEntities[entity].fields.filter(field=>!(entity==='mould_events'&&field.key==='trial_result'&&record.kind!=='trial')).map(field=>[field.key,entity==='remarks'?formatRemark(record[field.key],t):record[field.key]??null])));setReason('');setConfirmation('');setAccepted(false);setError('');setNotice('');
 }
 function changeEntity(value){setEntity(value);setRows([]);setSelection(null);setNotice('');}
 function title(row){
  if(entity==='jobs')return row.mould_code;
  if(entity==='remarks')return formatRemark(row.text,t);
  if(entity==='dispatch_batches')return row.label||(row.material||a.notSet)+' · '+(t.planning.modes[row.mode]||a.notSet);
  if(entity==='mould_events')return row.kind==='trial'?t.trials.trial.replace('{stage}',row.stage):({assembly:t.trials.assembly,correction_open:t.trials.corrections,correction_done:t.trials.corrections,finish:t.trials.finish,reopen:t.trials.reopen,void:t.trials.voided}[row.kind]||a.unknown);
  if(entity==='step_templates')return t.stageNames[row.step_name]||row.step_name;
  if(entity==='material_routes')return row.material+' · '+(t.stageNames[row.step_name]||row.step_name);
  if(entity==='settings')return ({alert_working_days:t.shell.alerts,bom_extraction_provider:t.gemini.settings,handover_buffer_days:t.planning.buffer,trial_lead_days:t.planning.lead,delay_scheduler_status:t.shell.alerts,delay_last_check:t.shell.alerts}[row.key]||a.unknown);
  return row.name||row.title||row.__part||row.step_name||row.__label||a.unknown;
 }
 const record=selection?.record,action=selection?.action;
 const recordName=record?title(record):'';
 const patch=record?changedAdminFields(entity,entity==='remarks'?{...record,text:formatRemark(record.text,t)}:record,form):{};
 async function save(event){
  event.preventDefault();if(!record||busy)return;
  setBusy(true);setError('');
  try{
   const r=await client.rpc('admin_manage_record',{p_table:entity,p_id:record.id||record.key,p_action:action,p_changes:action==='edit'?patch:{},p_reason:reason.trim(),p_version:record.__version});
   if(r.error)throw r.error;
   setSelection(null);setNotice(a.saved);await load();await onChanged?.(action,entity);
  }catch(failure){setError(explain(failure));}finally{setBusy(false);}
 }
 function options(field){
  if(field.type==='category')return ['base','child','turn','hardware'].map((value,i)=>[value,t.tabs[i]]);
  if(field.type==='priority')return Object.entries(t.workflow.priorities);
  if(field.type==='role')return ['viewer','operator','admin'].map(value=>[value,t.shell.roles[value]]);
  if(field.type==='receiptResult')return ['ok','short','excess','wrong'].map(value=>[value,a.results[value]]);
  if(field.type==='trialResult')return ['passed','needs_correction','not_needed'].map(value=>[value,a.results[value]]);
  if(field.type==='customer'||field.type==='vendor')return [['',a.notSet],...choices[field.type==='customer'?'customers':'vendors'].map(row=>[row.id,row.name])];
  if(field.type==='setting'&&record?.key==='bom_extraction_provider')return [['manual',t.gemini.manual],['gemini',t.gemini.gemini]];
  return null;
 }
 function renderField(field){
  const value=form[field.key],select=options(field),type=field.type==='setting'?typeof record.value==='number'?'number':typeof record.value==='boolean'?'boolean':'text':field.type;
  const update=value=>setForm(previous=>({...previous,[field.key]:value}));
  if(field.type==='setting'&&record.value&&typeof record.value==='object')return <p key={field.key} className="muted">{a.readOnly}</p>;
  if(type==='boolean')return <label key={field.key} className="check-row"><input type="checkbox" checked={Boolean(value)} disabled={busy} onChange={e=>update(e.target.checked)}/>{label(t,field.label)}</label>;
  return <Field key={field.key} label={label(t,field.label)}>{id=>select?<select id={id} className={inputClass} disabled={busy} value={value??''} onChange={e=>update(e.target.value||null)}>{select.map(([value,name])=><option key={value} value={value}>{name}</option>)}</select>:type==='long'?<textarea id={id} className={inputClass} disabled={busy} maxLength={2000} value={value??''} onChange={e=>update(e.target.value||null)}/>:<input id={id} className={inputClass} type={type==='number'?'number':type==='date'?'date':'text'} step={type==='number'?'any':undefined} disabled={busy} required={['name','mould_code','qty_required','qty','qty_found','actual_on','reported_on'].includes(field.key)} maxLength={field.key==='name'?160:300} value={value??''} onChange={e=>update(e.target.value===''?null:type==='number'?Number(e.target.value):e.target.value)}/>}</Field>;
 }
 return <Section title={a.title} hint={a.hint} icon="settings">
  <Button className="w-full" disabled={busy} onClick={()=>{setOpen(value=>!value);setSelection(null)}}>{open?a.close:a.open}</Button>
  {open&&<div className="space-y-4 mt-4">
   <Field label={a.entity}>{id=><select id={id} className={inputClass} disabled={busy} value={entity} onChange={e=>changeEntity(e.target.value)}>{Object.keys(adminEntities).filter(key=>!job||adminEntities[key].job).map(key=><option key={key} value={key}>{a.entities[key]}</option>)}</select>}</Field>
   {!job&&adminEntities[entity].job&&<Field label={a.mould}>{id=><select id={id} className={inputClass} disabled={busy} value={jobId} onChange={e=>{setJobId(e.target.value);setSelection(null)}}><option value="">{a.allMoulds}</option>{choices.jobs.map(row=><option key={row.id} value={row.id}>{row.mould_code} · {row.name}</option>)}</select>}</Field>}
   <Field label={a.view}>{id=><select id={id} className={inputClass} disabled={busy} value={deleted?'deleted':'current'} onChange={e=>{setDeleted(e.target.value==='deleted');setSelection(null)}}><option value="current">{a.current}</option><option value="deleted">{a.deleted}</option></select>}</Field>
   <form className="inline-form" onSubmit={event=>{event.preventDefault();setQuery(search.trim());setSelection(null);if(query===search.trim())load();}}><Field label={a.search} hint={a.searchHint}>{id=><input id={id} className={inputClass} type="search" maxLength={160} disabled={busy} value={search} onChange={e=>setSearch(e.target.value)}/>}</Field><Button disabled={busy}>{a.search}</Button></form>
   <p className="muted">{a.partial}</p>{deleted&&<p className="muted">{a.restoreHint}</p>}
   {notice&&<p role="status" className="notice">{notice}</p>}
   {error&&<StateBox title={error} error action={!selection&&<Button onClick={()=>load()}>{t.shell.retry}</Button>}/>}
   {selection?<form ref={formTarget} onSubmit={save} className="panel space-y-4">
    <h4 className="font-bold">{action==='edit'?a.edit:action==='delete'?a.remove:a.restore} · {recordName}</h4>
    {action==='edit'?adminEntities[entity].fields.filter(field=>field.key in form).map(renderField):<><p>{action==='restore'?a.restoreHint:entity==='jobs'?a.deleteMouldHint:entity==='bom_sheets'?a.fileHint:a.deleteHint}</p>{entity==='jobs'&&action==='delete'?<Field label={a.confirm} hint={record.mould_code}>{id=><input id={id} className={inputClass} required autoComplete="off" disabled={busy} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/>}</Field>:<label className="check-row"><input type="checkbox" required checked={accepted} disabled={busy} onChange={e=>setAccepted(e.target.checked)}/>{action==='delete'?a.confirmDelete:a.confirmRestore}</label>}</>}
    <Field label={a.reason} hint={a.reasonHint}>{id=><textarea id={id} className={inputClass} required maxLength={500} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/>}</Field>
    <div className="flex flex-wrap gap-3"><Button type="button" disabled={busy} onClick={()=>setSelection(null)}>{t.shell.cancel}</Button><Button type="submit" primary disabled={busy||!reason.trim()||(action==='edit'?!Object.keys(patch).length:entity==='jobs'&&action==='delete'?confirmation!==record.mould_code:!accepted)}>{busy?t.loading:action==='edit'?a.save:action==='delete'?a.confirmDelete:a.confirmRestore}</Button></div>
   </form>:loading&&!rows.length?<StateBox title={t.loading}/>:!error&&!rows.length?<StateBox title={a.empty}/>:rows.map(row=><div className="data-row flex-wrap" key={row.id||row.key}><div className="details"><strong>{title(row)}</strong>{entity==='jobs'&&<p>{row.name}</p>}{row.__job&&entity!=='jobs'&&<p>{choices.jobs.find(item=>item.id===row.__job)?.mould_code||job?.mould_code}</p>}{row.category&&<p>{t.tabs[['base','child','turn','hardware'].indexOf(row.category)]}</p>}{row.step_name&&row.__part&&<p>{t.stageNames[row.step_name]||row.step_name}</p>}{(row.actual_on||row.received_on||row.reported_on)&&<p>{t.planning.actualDate}: {row.actual_on||row.received_on||row.reported_on}</p>}{row.qty_found!==undefined&&<p>{t.receiving.qty}: {row.qty_found}</p>}{row.qty!==undefined&&<p>{t.planning.quantity}: {row.qty}</p>}{row.role&&<p>{t.shell.roles[row.role]}</p>}</div><div className="flex flex-wrap gap-2">{deleted?<Button disabled={busy||loading} onClick={()=>begin(row,'restore')}>{a.restore}</Button>:<><Button disabled={busy||loading} onClick={()=>begin(row,'edit')}>{a.edit}</Button><Button disabled={busy||loading} onClick={()=>begin(row,'delete')}>{a.remove}</Button></>}</div></div>)}
   {more&&!selection&&<Button disabled={busy||loading} onClick={()=>load(true)}>{loading?t.loading:a.more}</Button>}
  </div>}
 </Section>;
}
