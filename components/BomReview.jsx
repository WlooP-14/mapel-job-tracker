'use client';
import {useEffect,useRef,useState} from 'react';
import {CATEGORIES,parseSize,sizeWarnings} from '../lib/bom';
import {parseBomWorkbook} from '../lib/bom-import';
import {existingBomMatches} from '../lib/bom-matches';
import {CategoryTabs} from './MouldCards';
import {Button,Field,inputClass} from './ui';
import {Section,StateBox,Icon} from './Shell';
import {loadDraft,saveDraft,removeDraft} from '../lib/drafts';
const blank=category=>({id:crypto.randomUUID(),category,name:'',material:'',qty_required:1,finish_size_text:'',rough_size_text:'',size_text:'',remark:'',two_d_submitted:false,update_id:''});
export default function BomReview({client,profile,job,parts,t,initialSource,onBack,onFileSaved,onSaved}){
 const b=t.bom,w=t.workflow;const [rows,setRows]=useState([]),[first,setFirst]=useState(null),[file,setFile]=useState(null),[preview,setPreview]=useState(''),[reading,setReading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[category,setCategory]=useState('base'),[code,setCode]=useState(''),[codeAccepted,setCodeAccepted]=useState(false),[metadata,setMetadata]=useState({}),[reviewed,setReviewed]=useState(false),[ack,setAck]=useState(false),[undo,setUndo]=useState(null),[sheet,setSheet]=useState(false),[importId,setImportId]=useState(()=>crypto.randomUUID()),[source,setSource]=useState('');
 const [pendingFiles,setPendingFiles]=useState([]);
 const [fileToken,setFileToken]=useState(()=>crypto.randomUUID());
 const fileInput=useRef(null);
 const draftKey='bom:'+profile.id+':'+job.id+(initialSource?':'+initialSource.id:'');
 const [draftReady,setDraftReady]=useState(false),[draftNotice,setDraftNotice]=useState('');
 useEffect(()=>{let active=true;loadDraft(draftKey).catch(()=>{if(active)setDraftNotice(b.draftUnavailable);return null;}).then(async draft=>{if(!active)return;if(draft){setRows(draft.rows||[]);setFile(draft.file||null);setPendingFiles(draft.pendingFiles||[]);setFirst(draft.first||null);setMetadata(draft.metadata||{});setCode(draft.code||'');setImportId(draft.importId);setSource(draft.source||'');setFileToken(draft.fileToken);setDraftNotice(b.draftRestored)}else if(initialSource){await prepareFile(initialSource.file,[],initialSource.path);}if(active)setDraftReady(true)}).catch(()=>{if(active){setDraftReady(true);setDraftNotice(b.draftUnavailable)}});return()=>{active=false}},[draftKey]);
 useEffect(()=>{if(!draftReady||busy||reading||(!rows.length&&!file))return;const timer=setTimeout(()=>{saveDraft(draftKey,{rows,file,first,metadata,code,importId,source,fileToken,pendingFiles}).catch(()=>setDraftNotice(b.draftUnavailable))},300);return()=>clearTimeout(timer)},[draftReady,draftKey,rows,file,first,metadata,code,importId,source,fileToken,pendingFiles,busy,reading,b.draftUnavailable]);
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 useEffect(()=>{if(!undo)return;const timer=setTimeout(()=>setUndo(null),10000);return()=>clearTimeout(timer)},[undo]);
 const materials=[...new Set(parts.map(p=>p.material).filter(Boolean))];
 function changeRows(next){setUndo(rows);setRows(next);setReviewed(false);setAck(false);}
 function edit(id,key,value){setRows(old=>old.map(row=>row.id===id?{...row,[key]:value}:row));setReviewed(false);setAck(false);}
 async function prepareFile(chosen, remaining, savedPath=''){
  const draft={file:chosen,pendingFiles:remaining,rows:[],first:null,metadata:{},code:'',source:savedPath,importId:crypto.randomUUID(),fileToken:crypto.randomUUID()};
  let parseError=false;
  if(/\.xlsx$/i.test(chosen.name)){
   try{
    const {default:readExcel}=await import('read-excel-file/browser');
    const result=parseBomWorkbook(await readExcel(chosen));
    draft.rows=result.rows.map(row=>({...blank(row.category),...row}));
    draft.first={rows:structuredClone(draft.rows),metadata:result.signoff};
    draft.metadata=result.signoff;
    draft.code=result.code;
   }catch{parseError=true;}
  }
  await saveDraft(draftKey,draft).catch(()=>setDraftNotice(b.draftUnavailable));
  setFile(chosen);setPendingFiles(remaining);setRows(draft.rows);setFirst(draft.first);
  setMetadata(draft.metadata);setCode(draft.code);setSource(draft.source);setImportId(draft.importId);setFileToken(draft.fileToken);
  setCategory(draft.rows[0]?.category||'base');setReviewed(false);setAck(false);setCodeAccepted(false);setUndo(null);
  setError(parseError?b.parseError:'');
 }

 async function chooseFile(e){
  const chosen=Array.from(e.currentTarget.files||[]);
  e.currentTarget.value='';
  if(!chosen.length)return;
  if(chosen.some(item=>item.size>10485760)){setError(b.fileTooLarge);return;}
  if(chosen.some(item=>!/\.(xlsx|pdf|jpe?g|png|webp)$/i.test(item.name))){setError(b.fileInvalid);return;}
  setError('');
  if(file||rows.length){setPendingFiles(previous=>[...previous,...chosen]);return;}
  setReading(true);
  try{await prepareFile(chosen[0],chosen.slice(1));}
  finally{setReading(false);}
 }
 async function discardFile(){
  setReading(true);
  try{
   if(pendingFiles.length){await prepareFile(pendingFiles[0],pendingFiles.slice(1));return;}
   await removeDraft(draftKey).catch(()=>setDraftNotice(b.draftUnavailable));
   setFile(null);setRows([]);setFirst(null);setMetadata({});setCode('');setSource('');
   setImportId(crypto.randomUUID());setFileToken(crypto.randomUUID());
   setReviewed(false);setAck(false);setCodeAccepted(false);setUndo(null);setError('');
  }finally{setReading(false);}
 }
 const appendOnly=Boolean(file||initialSource);
 const reviewRows=appendOnly?rows.map(row=>({...row,update_id:''})):rows;
 const matches=existingBomMatches(reviewRows,parts);
 const kept=reviewRows.filter(row=>matches.has(row.id)&&!row.update_id&&!row.add_separately);
 const keptIds=new Set(kept.map(row=>row.id));
 const newOrRevised=reviewRows.filter(row=>!keptIds.has(row.id));
 const mismatch=code&&code!==job.mould_code,updates=newOrRevised.filter(r=>r.update_id),progress=updates.some(row=>parts.find(p=>p.id===row.update_id)?.part_steps.some(s=>s.status!=='PENDING'||s.batch_id));
 const valid=rows.length>0&&rows.every(row=>row.name.trim()&&Number(row.qty_required)>0&&Number.isFinite(Number(row.qty_required)));
 const draftSnapshot={rows,file,first,metadata,code,importId,source,fileToken,pendingFiles};

 async function leaveReview(){
  if(rows.length||file){
   await saveDraft(draftKey,draftSnapshot).catch(()=>setDraftNotice(b.draftUnavailable));
  }
  onBack();
 }

 async function save(e){
  e.preventDefault();
  if(busy||reading||!valid||!reviewed||(mismatch&&!codeAccepted)||(progress&&!ack)||(updates.length&&!metadata.reason?.trim()))return;
  setBusy(true);
  setError('');
  try{
   await saveDraft(draftKey,draftSnapshot).catch(()=>setDraftNotice(b.draftUnavailable));
   let sourcePath=source;
   if(file&&!sourcePath){
    const filename=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100);
    sourcePath=`${job.id}/${importId}/${fileToken}-${filename}`;
    const extension=file.name.split('.').at(-1).toLowerCase();
    const mimeTypes={xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pdf:'application/pdf',webp:'image/webp',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'};
    const upload=await client.storage.from('bom-sources').upload(sourcePath,file,{contentType:mimeTypes[extension],upsert:false});
    if(upload.error&&String(upload.error.statusCode)!=='409')throw upload.error;
    setSource(sourcePath);
   }
   const payload=newOrRevised.map(({add_separately,...row})=>({
    ...row,
    qty_required:Number(row.qty_required),
    finish_dims:parseSize(row.finish_size_text),
    rough_dims:parseSize(row.rough_size_text)
   }));
   if(payload.length){
    const result=await client.rpc('import_bom',{
     p_job:job.id,
     p_import:importId,
     p_rows:payload,
     p_metadata:{...metadata,code:job.mould_code,source:sourcePath}
    });
    if(result.error)throw result.error;
   }else if(file&&!initialSource){
    const attachment={id:importId,job_id:job.id,section:'base',revision_no:0,title:file.name,source_image:sourcePath};
    const result=await client.from('bom_sheets').upsert(attachment,{onConflict:'id',ignoreDuplicates:true});
    if(result.error)throw result.error;
   }
   if(pendingFiles.length){
    await prepareFile(pendingFiles[0],pendingFiles.slice(1));
    await onFileSaved();
    setDraftNotice(payload.length?b.saved:b.keptExisting);
    window.scrollTo(0,0);
   }else{
    await removeDraft(draftKey).catch(()=>{});
    onSaved(payload.length?b.saved:b.keptExisting);
   }
  }catch(error){
   if(error?.message?.includes('QUANTITY_WITH_PROGRESS'))setError(t.receiving.quantityProgress);
   else if(error?.message?.includes('Cannot move a part with progress'))setError(b.progressWarning);
   else setError(t.invalid);
  }finally{
   setBusy(false);
  }
 }
 function duplicate(row){changeRows([...rows.slice(0,rows.indexOf(row)+1),{...row,id:crypto.randomUUID(),update_id:''},...rows.slice(rows.indexOf(row)+1)]);}
 function move(row,direction){const index=rows.indexOf(row),next=index+direction;if(next<0||next>=rows.length)return;const copy=[...rows];[copy[index],copy[next]]=[copy[next],copy[index]];changeRows(copy);}
 function rowWarnings(row){const warnings=row.category==='hardware'?[]:sizeWarnings(row.finish_size_text,row.rough_size_text);if(rows.some(other=>other.id!==row.id&&other.category===row.category&&other.name.trim().toLowerCase()===row.name.trim().toLowerCase())||parts.some(other=>other.id!==row.update_id&&other.category===row.category&&other.name.toLowerCase()===row.name.trim().toLowerCase()))warnings.push('duplicate');return warnings;}
 const shown=rows.filter(row=>row.category===category);
 const fields=category==='hardware'?[['name',b.name],['size_text',b.size],['qty_required',b.qty],['remark',b.remark]]:[['name',b.name],['finish_size_text',b.finish],['rough_size_text',b.rough],['material',b.material],['qty_required',b.qty]];
 const cell=(row,key,label,id)=> <input id={id||`${row.id}-${key}`} aria-label={`${label} ${b.row} ${shown.indexOf(row)+1}`} className={inputClass} type={key==='qty_required'?'number':'text'} min={key==='qty_required'?'0.001':undefined} step={key==='qty_required'?'any':undefined} maxLength={key==='name'?160:300} list={key==='material'?'review-materials':undefined} value={row[key]??''} onInput={e=>edit(row.id,key,e.currentTarget.value)} onChange={e=>edit(row.id,key,e.target.value)} required={key==='name'||key==='qty_required'}/>;
 if(!draftReady)return <StateBox title={t.loading}/>;
 return <section className="space-y-5">{draftNotice&&<p role="status" className="notice">{draftNotice}</p>}<Button onClick={leaveReview} disabled={busy||reading}><Icon name="back"/>{w.back}</Button><h2 className="page-title">{rows.length?b.review:b.addBom}</h2><Section title={b.source} hint={initialSource?undefined:b.sourceHint}>{!initialSource&&<><input ref={fileInput} type="file" multiple hidden accept=".xlsx,.pdf,.jpg,.jpeg,.png,.webp" onChange={chooseFile} disabled={busy||reading}/><Button type="button" className="w-full" disabled={busy||reading} onClick={()=>fileInput.current?.click()}>{b.addFiles}</Button></>}{file&&<div className="mt-3 space-y-2"><p className="break-all"><strong>{b.currentFile}</strong> {file.name}</p>{!initialSource&&<Button type="button" disabled={busy||reading} onClick={discardFile}>{b.skipFile}</Button>}</div>}{pendingFiles.length>0&&<div className="mt-3"><strong>{b.waitingFiles}</strong><ul>{pendingFiles.map((item,index)=><li className="data-row flex-wrap break-all" key={index}><span>{item.name}</span><Button type="button" disabled={busy||reading} onClick={()=>setPendingFiles(previous=>previous.filter((_,i)=>i!==index))}>{b.remove}</Button></li>)}</ul></div>}{file&&!/\.xlsx$/i.test(file.name)&&<p className="notice mt-3">{b.notConfigured}</p>}{file&&preview&&!/\.xlsx$/i.test(file.name)&&<details className="mt-3"><summary>{b.original}</summary>{/\.pdf$/i.test(file.name)?<iframe className="source-preview" src={preview} title={b.sourcePreview}/>:<img src={preview} alt={b.sourcePreview} className="source-preview"/>}</details>}{!rows.length&&<Button className="mt-4 w-full" onClick={()=>{const draft=[blank(category)];setRows(draft);setFirst({rows:structuredClone(draft),metadata:{}});}} disabled={reading||busy}>{b.manual}</Button>}</Section>
 {reading&&<StateBox title={t.loading}/>}<Section title={job.mould_code} hint={job.name}><p>{b.addingTo} <strong>{job.mould_code}</strong></p>{mismatch&&<><p className="notice mt-3">{b.codeMismatch.replace('{code}',code)}</p><label className="check-row"><input type="checkbox" checked={codeAccepted} onChange={e=>setCodeAccepted(e.target.checked)}/>{b.useCurrent}</label></>}</Section>
 {rows.length>0&&<form onSubmit={save} className="space-y-5" inert={busy||reading}><p className="muted">{b.reviewHint}</p><Section title={b.compare}><p>{b.current}: {parts.length} · {b.added}: {newOrRevised.length-updates.length} · {b.changed}: {updates.length} · {b.alreadySaved}: {kept.length}</p><p className="muted mt-2">{b.noChanges}</p></Section><div className="flex flex-wrap gap-3"><Button type="button" onClick={()=>setSheet(!sheet)}>{sheet?b.cardView:b.sheetView}</Button>{undo&&<Button type="button" onClick={()=>{setRows(undo);setUndo(null);setReviewed(false)}}>{b.undo}</Button>}{first&&<Button type="button" onClick={()=>{changeRows(structuredClone(first.rows));setMetadata({...first.metadata})}}>{b.revert}</Button>}</div><CategoryTabs category={category} onChange={setCategory} parts={rows} t={t}/><p className="muted">{b.total.replace('{count}',rows.length)}</p><datalist id="review-materials">{materials.map(m=><option key={m} value={m}/>)}</datalist>
 {sheet&&<><p className="muted">{b.turnPhone}</p><div className="bom-sheet-scroll"><table className="bom-sheet"><thead><tr><th>{b.serial}</th>{fields.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead><tbody>{shown.map((row,index)=><tr key={row.id}><td>{index+1}</td>{fields.map(([key,label])=><td key={key}>{cell(row,key,label)}</td>)}</tr>)}</tbody></table></div></>}
 <div className="space-y-4">{shown.map((row,index)=>{const warnings=rowWarnings(row),target=appendOnly?null:parts.find(p=>p.id===row.update_id);return <article className="panel space-y-3" key={row.id}><div className="section-heading"><h3>{b.row} {index+1}</h3>{warnings.length>0&&<span className="plain-badge">{w.checkBeforeSave}</span>}</div>{!sheet&&<div className="review-fields">{fields.map(([key,label])=><Field key={key} label={label}>{id=>cell(row,key,label,id)}</Field>)}</div>}<Field label={w.section}>{id=><select id={id} className={inputClass} value={row.category} onChange={e=>{edit(row.id,'category',e.target.value);setCategory(e.target.value)}}>{CATEGORIES.map((c,i)=><option key={c} value={c}>{t.tabs[i]}</option>)}</select>}</Field>{!appendOnly&&<Field label={b.target}>{id=><select id={id} className={inputClass} value={row.update_id||''} onChange={e=>{const id=e.target.value;setRows(old=>old.map(r=>r.id===row.id?{...r,update_id:id,two_d_submitted:parts.find(p=>p.id===id)?.two_d_submitted??r.two_d_submitted}:r));setReviewed(false);setAck(false)}}><option value="">{b.newPart}</option>{parts.filter(p=>p.category===row.category||p.id===row.update_id).map(p=><option key={p.id} value={p.id}>{p.serial_no}. {p.name}</option>)}</select>}</Field>}{matches.has(row.id)&&!target&&<label className="check-row"><input type="checkbox" checked={Boolean(row.add_separately)} onChange={e=>edit(row.id,'add_separately',e.target.checked)}/>{b.addSeparate}</label>}{keptIds.has(row.id)&&<p className="muted">{b.keepMatch}</p>}{target&&<div className="notice"><strong>{b.updateExisting}: {target.name}</strong><p>{w.quantity}: {target.qty_required} → {row.qty_required}</p><p>{w.material}: {target.material||w.notSet} → {row.material||w.notSet}</p><p>{w.finishSize}: {target.finish_size_text||w.notSet} → {row.finish_size_text||w.notSet}</p>{target.part_steps.some(s=>s.status!=='PENDING')&&<p className="font-bold mt-2">{b.progressWarning}</p>}</div>}<label className="check-row"><input type="checkbox" checked={row.two_d_submitted} onChange={e=>edit(row.id,'two_d_submitted',e.target.checked)}/>{w.twoD}</label>{warnings.map(key=><p key={key} className="muted">{w.checkBeforeSave}: {w.warnings[key]}</p>)}<div className="flex flex-wrap gap-2">{[[b.duplicate,()=>duplicate(row)],[b.remove,()=>changeRows(rows.filter(r=>r.id!==row.id))],[b.up,()=>move(row,-1)],[b.down,()=>move(row,1)]].map(([label,action])=><Button type="button" key={label} onClick={action}>{label}</Button>)}</div></article>})}</div><Button type="button" className="w-full" onClick={()=>changeRows([...rows,blank(category)])}><Icon name="plus"/>{b.addRow}</Button><Section title={b.signoff}><div className="review-fields">{['prepared_by','review_by','checked_by','order_by','sheet_date','received_by'].map(key=><Field key={key} label={b[key]}>{id=><input id={id} className={inputClass} maxLength={160} value={metadata[key]||''} onChange={e=>setMetadata(old=>({...old,[key]:e.target.value}))}/>}</Field>)}</div></Section>{updates.length>0&&<Field label={b.reason} hint={b.revisionReason}>{id=><input id={id} className={inputClass} required maxLength={500} value={metadata.reason||''} onChange={e=>setMetadata(old=>({...old,reason:e.target.value}))}/>}</Field>}{!valid&&<StateBox title={b.invalidQty}/>}<label className="check-row"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>{b.reviewed}</label>{progress&&<label className="check-row"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>{b.ackProgress}</label>}{error&&<StateBox error title={error}/>}<Button type="submit" primary className="w-full" disabled={busy||reading||!valid||!reviewed||Boolean(mismatch&&!codeAccepted)||Boolean(progress&&!ack)||Boolean(updates.length&&!metadata.reason?.trim())}>{busy?t.loading:pendingFiles.length?b.saveNext:b.confirm}</Button></form>}{!rows.length&&error&&<StateBox title={error} error/>}</section>;
}
