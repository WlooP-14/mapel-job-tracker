'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {startRegistration,startAuthentication} from '@simplewebauthn/browser';
import {Button,Field,inputClass} from './ui';
import {Icon,Section,StateBox} from './Shell';

export default function DeveloperPanel({client,profile,t,onBack,onSettings}){
 const d=t.developer;
 const [state,setState]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[factor,setFactor]=useState(''),[enrollment,setEnrollment]=useState(null),[code,setCode]=useState(''),[verified,setVerified]=useState(false),[deviceName,setDeviceName]=useState(''),[flow,setFlow]=useState(null),[delay,setDelay]=useState(false),[ticket,setTicket]=useState(null),[confirmation,setConfirmation]=useState(''),[holding,setHolding]=useState(false),[progress,setProgress]=useState(0),[audit,setAudit]=useState(null);
 const hold=useRef({version:0,timer:null,interval:null,active:false}),flowTarget=useRef(null),backupInput=useRef(null);
 const api=useCallback(async(action,data={})=>{
  const session=await client.auth.getSession();if(!session.data.session)throw Error('DEVELOPER_ONLY');
  const r=await fetch('/api/developer'+(action==='audit'?'?view=audit':''),{method:action==='state'||action==='audit'?'GET':'POST',headers:{Authorization:'Bearer '+session.data.session.access_token,...(action==='state'||action==='audit'?{}:{'content-type':'application/json'})},...(action==='state'||action==='audit'?{}:{body:JSON.stringify({action,...data})}),cache:'no-store'});
  const result=await r.json();if(!r.ok)throw Error(result.code);return result;
 },[client]);
 const load=useCallback(async()=>{
  try{setState(await api('state'));const factors=await client.auth.mfa.listFactors();if(!factors.error&&factors.data.totp?.[0]?.id)setFactor(factors.data.totp[0].id);}catch(failure){setError(d.errors[failure.message]||d.errors.SECURITY_FAILED)}
 },[api,client,d]);
 useEffect(()=>{if(profile.role!=='developer')return;load();const timer=setInterval(load,15000);return()=>clearInterval(timer)},[profile.role,load]);
 useEffect(()=>{if(flow)flowTarget.current?.scrollIntoView({behavior:'smooth',block:'start'})},[flow?.purpose,flow?.requestId]);
 function stopHold(){hold.current.active=false;hold.current.version++;clearTimeout(hold.current.timer);clearInterval(hold.current.interval);setHolding(false);setProgress(0);}
 useEffect(()=>{const stop=()=>{if(document.hidden||!navigator.onLine)stopHold()},blur=()=>stopHold();document.addEventListener('visibilitychange',stop);window.addEventListener('offline',stop);window.addEventListener('blur',blur);return()=>{stopHold();document.removeEventListener('visibilitychange',stop);window.removeEventListener('offline',stop);window.removeEventListener('blur',blur)}},[]);
 if(profile.role!=='developer')return null;
 async function act(callback){setBusy(true);setError('');setNotice('');try{await callback();await load();}catch(failure){setError(d.errors[failure.message]||d.errors.SECURITY_FAILED);setVerified(false);setTicket(null);}finally{setBusy(false)}}
 async function enroll(){await act(async()=>{const r=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Mould Job Tracker security'});if(r.error)throw Error('SECURITY_FAILED');const {default:qr}=await import('qrcode');setFactor(r.data.id);setEnrollment({qr:await qr.toDataURL(r.data.totp.uri),secret:r.data.totp.secret});});}
 async function verifyCode(event){event.preventDefault();await act(async()=>{const result=await api('totp',{factorId:factor,code});const updated=await client.auth.setSession(result);if(updated.error)throw Error('SECURITY_FAILED');setVerified(true);setEnrollment(null);setCode('');setNotice(d.verified);});}
 async function verifyPasskey(purpose){await act(async()=>{
  const options=await api('options',{purpose,name:deviceName,delay,requestId:flow?.requestId});
  const response=purpose==='register'?await startRegistration({optionsJSON:options.options}):await startAuthentication({optionsJSON:options.options});
  const result=await api('verify',{challengeId:options.challengeId,response});
  if(purpose==='register'){setDeviceName('');setNotice(d.saved);}else if(purpose==='cancel'){await api('cancel',result);setFlow(null);setNotice(d.saved);}else{setTicket(result);setNotice(d.passkeyVerified);}
 });}
 async function beginHold(event){
  if(busy||!ticket||confirmation!=='DELETE'||!navigator.onLine||hold.current.active)return;
  if(event.type==='keydown'&&![' ','Enter'].includes(event.key)||event.repeat)return;
  event.preventDefault();if(event.pointerId!==undefined)event.currentTarget.setPointerCapture(event.pointerId);
  hold.current.active=true;const version=++hold.current.version;setHolding(true);setError('');
  try{
   await api('hold',ticket);if(!hold.current.active||version!==hold.current.version)return;
   const start=performance.now();hold.current.interval=setInterval(()=>setProgress(Math.min(100,(performance.now()-start)/50)),50);
   hold.current.timer=setTimeout(async()=>{if(!hold.current.active||version!==hold.current.version)return;stopHold();await act(async()=>{await api('commit',{...ticket,confirmation});setTicket(null);setFlow(null);setConfirmation('');setVerified(false);setNotice(d.scheduled);});},5000);
  }catch(failure){stopHold();setError(d.errors[failure.message]||d.errors.SECURITY_FAILED);}
 }
 const locked=state?.lockedUntil&&Date.parse(state.lockedUntil)>Date.now();
 const codeForm=<form onSubmit={verifyCode} className="inline-form"><Field label={d.code}>{id=><input id={id} className={inputClass} type="password" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} disabled={busy||locked} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/>}</Field><Button disabled={busy||locked}>{d.verifyCode}</Button></form>;
 return <section className="space-y-5">
  <Button onClick={onBack} disabled={busy||holding}><Icon name="back"/>{d.back}</Button><h2 className="page-title">{d.title}</h2><p className="muted">{d.intro}</p>
  {error&&<StateBox error title={error} action={<Button onClick={()=>{setError('');load()}}>{d.refresh}</Button>}/>} {notice&&<p role="status" className="notice">{notice}</p>}
  {!state?<StateBox title={t.loading}/>:<>
   <Section title={d.freeze} hint={d.freezeHint}><Button disabled={busy||holding} onClick={()=>act(async()=>{await api('freeze',{value:!state.frozen});setNotice(d.saved)})}>{state.frozen?d.unfreeze:d.freeze}</Button></Section>
   <Section title={d.setup}>
    <h4 className="font-bold mt-3">{d.authenticator}</h4>
    {!factor&&<Button className="mt-3 w-full" disabled={busy||locked} onClick={enroll}>{d.enroll}</Button>}
    {enrollment&&<div className="space-y-3 mt-3"><img className="authenticator-qr" src={enrollment.qr} width="200" height="200" alt={d.authenticatorQr}/><details><summary>{d.secret}</summary><code className="break-all">{enrollment.secret}</code></details></div>}
    {factor&&!flow&&codeForm}
    <h4 className="font-bold mt-5">{d.devices}</h4><p className="muted mt-2">{d.deviceHint}</p>
    {state.devices.map(device=><div className="data-row flex-wrap" key={device.id}><strong>{device.name}</strong><Button disabled={busy||!verified||locked} onClick={()=>act(()=>api('removeDevice',{id:device.id}))}>{d.removeDevice}</Button></div>)}
    <Field label={d.deviceName}>{id=><input id={id} className={inputClass} maxLength={80} value={deviceName} disabled={busy||locked} onChange={e=>setDeviceName(e.target.value)}/>}</Field>
    <Button className="w-full mt-3" disabled={busy||!verified||locked||!deviceName.trim()} onClick={()=>verifyPasskey('register')}>{d.registerDevice}</Button>
   </Section>
   <Section title={d.backup} hint={d.backupHint}>{state.backupAt&&<p>{new Date(state.backupAt).toLocaleString()}</p>}<input ref={backupInput} type="file" hidden accept=".json,application/json" disabled={busy||!verified||locked} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)act(async()=>{if(file.size>30000)throw Error('BACKUP_NOT_VERIFIED');await api('backup',{receipt:JSON.parse(await file.text())});setNotice(d.saved);});}}/><Button className="mt-3 w-full" disabled={busy||!verified||locked} onClick={()=>backupInput.current?.click()}>{d.backupImport}</Button></Section>
   <Section title={d.prerequisites}>{state.missing.length?<ul className="list-disc pl-5 space-y-3 mt-3">{state.missing.map(item=><li key={item}>{d.missing[item]}</li>)}</ul>:<p>{d.ready}</p>}</Section>
   <Section title={d.kill} hint={d.warning}><p className="font-bold mt-3">{d.scope}</p><p className="mt-2">{d.scopeText}</p><Button className="w-full mt-4" disabled={busy||!state.ready||locked} onClick={()=>{stopHold();setFlow({purpose:'wipe'});setTicket(null);setVerified(false);setConfirmation('');setNotice('');}}>{d.kill}</Button></Section>
   {flow&&<section ref={flowTarget} className="panel kill-confirm space-y-4"><h3>{flow.purpose==='cancel'?d.cancelTitle:d.kill}</h3><p>{d.scopeText}</p><p className="muted">{d.authenticator}</p>{!verified&&codeForm}{flow.purpose==='wipe'&&<><label className="check-row"><input type="checkbox" checked={delay} disabled={busy||holding} onChange={e=>{setDelay(e.target.checked);setTicket(null)}}/>{d.delay}</label><p className="muted">{d.delayHint}</p></>}
    {!ticket&&<Button disabled={busy||!verified||locked} onClick={()=>verifyPasskey(flow.purpose)}>{d.verifyDevice}</Button>}
    {ticket&&flow.purpose==='wipe'&&<><Field label={d.confirmation}>{id=><input id={id} className={inputClass} value={confirmation} disabled={busy||holding} autoComplete="off" onChange={e=>setConfirmation(e.target.value)}/>}</Field><Button primary className="w-full" disabled={busy||confirmation!=='DELETE'||locked} onPointerDown={beginHold} onPointerUp={stopHold} onPointerCancel={stopHold} onLostPointerCapture={stopHold} onKeyDown={beginHold} onKeyUp={stopHold} onBlur={stopHold}>{holding?d.holding:d.hold}</Button>{holding&&<progress className="w-full" value={progress} max="100" aria-label={d.hold}/>}</>}
    <Button disabled={busy||holding} onClick={()=>{stopHold();setFlow(null);setTicket(null)}}>{d.close}</Button>
   </section>}
   <Section title={d.requests}>{!state.requests.length?<p>{d.noRequests}</p>:state.requests.map(request=><div className="data-row flex-wrap" key={request.id}><div><strong>{d.requestStatus[request.status]}</strong><p>{new Date(request.scheduled_for).toLocaleString()}</p></div>{request.status==='scheduled'&&<Button disabled={busy} onClick={()=>{stopHold();setFlow({purpose:'cancel',requestId:request.id});setTicket(null);setVerified(false);setNotice('')}}>{d.cancel}</Button>}</div>)}</Section>
   <Button className="w-full" onClick={onSettings}>{d.admins}</Button><Section title={d.audit}><Button disabled={busy} onClick={()=>act(async()=>setAudit((await api('audit')).rows))}>{d.refresh}</Button>{audit?.length===0&&<p>{d.noAudit}</p>}{audit?.map(row=><div className="data-row flex-wrap" key={row.id}><div><strong>{row.table_name} · {row.action}</strong><p>{new Date(row.at).toLocaleString()}</p>{row.reason&&<p>{row.reason}</p>}<details><summary>{d.auditChange}</summary><pre className="audit-values">{JSON.stringify({before:row.old_value,after:row.new_value},null,2)}</pre></details></div></div>)}</Section>
  </>}
 </section>;
}
