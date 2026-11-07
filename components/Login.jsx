'use client';

import {useState} from 'react';
import {indiaPhone,indiaPhoneDigits,keepSignedIn,signInWithPin} from '../lib/pin-auth';
import {Button,Field,inputClass} from './ui';
import {Icon,StateBox} from './Shell';

const otpEnabled=process.env.NEXT_PUBLIC_PHONE_OTP_ENABLED==='true';

export default function Login({client,t}){
 const copy=t.teamAuth;
 const [phone,setPhone]=useState(''),[pin,setPin]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [show,setShow]=useState(false),[remember,setRemember]=useState(true),[longPin,setLongPin]=useState(false);
 const [otp,setOtp]=useState(false),[otpSent,setOtpSent]=useState(false);
 const [register,setRegister]=useState(false),[name,setName]=useState(''),[notice,setNotice]=useState('');
 const sixDigits=register||otp||!longPin;

 function resetCode(){setPin('');setError('');setOtpSent(false);}
 async function submit(event){
  event.preventDefault();
  setBusy(true);setError('');
  try{
   const number=indiaPhone(phone);
   if(register){
    if(!/^\S+\s+\S/u.test(name.trim())){setError(copy.fullNameHint);return;}
    const response=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,phone:number,pin})});
    if(!response.ok){setError(response.status===409?copy.registrationExists:response.status===429?t.shell.tooMany:copy.registrationFailed);return;}
    setRegister(false);setName('');resetCode();setNotice(copy.registrationSent);return;
   }
   keepSignedIn(remember);
   const result=otp?(otpSent
    ?await client.auth.verifyOtp({phone:number,token:pin,type:'sms'})
    :await client.auth.signInWithOtp({phone:number,options:{shouldCreateUser:false}}))
    :await signInWithPin(client,number,pin);
   if(result.error){setError(result.error.status===429?t.shell.tooMany:otp&&!otpSent?copy.sendFailed:t.invalid);return;}
   if(otp&&!otpSent)setOtpSent(true);
   setPin('');
  }catch{setError(t.shell.networkError)}finally{setBusy(false);}
 }

 return <section className="login-page">
  <div className="login-brand"><img src="/mapel-logo.png" width="88" height="88" alt={t.shell.brandAlt}/><h1>{t.app}</h1><p>{t.shell.loginSubtitle}</p></div>
  {!client?<StateBox title={t.config} detail={t.shell.configHelp}/>:<form onSubmit={submit} className="panel login-form">
   <div className="section-heading"><h2>{register?copy.register:t.signIn}</h2><span className="plain-badge">{t.shell.privatePin}</span></div>
   <p className="muted">{register?copy.registrationHelp:copy.invite}</p>
   {notice&&<p className="notice" role="status">{notice}</p>}
   {register&&<Field label={copy.fullName} hint={copy.fullNameHint}>{id=><input id={id} className={inputClass} autoComplete="name" value={name} onChange={event=>setName(event.target.value)} required maxLength={160} disabled={busy}/>}</Field>}
   <Field label={t.phone} hint={copy.phoneHint}>{id=><div className="flex items-center gap-2"><span className="plain-badge">+91</span><input id={id} type="tel" autoComplete="tel-national" className={inputClass} value={phone} onChange={event=>{setPhone(indiaPhoneDigits(event.target.value));resetCode();}} required pattern="[0-9]{10}" disabled={busy}/></div>}</Field>
   {(!otp||otpSent)&&<Field label={otp?copy.code:longPin&&!register?t.pin:copy.pin}>{id=><div className={sixDigits?'login-pin-grid':undefined}>
    {sixDigits&&<div className="login-pin-boxes" aria-hidden="true">{Array.from({length:6},(_,index)=><span key={index}>{pin[index]&&(show||otp?pin[index]:'●')}</span>)}</div>}
    <input id={id} className={sixDigits?'login-pin-input':inputClass} type={show||otp?'text':'password'} autoComplete={register?'new-password':otp?'one-time-code':'current-password'} inputMode="numeric" pattern={sixDigits?'[0-9]{6}':'[0-9]{8,12}'} maxLength={sixDigits?6:12} value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,''))} required disabled={busy}/>
   </div>}</Field>}
   {!otp&&<label className="check-row"><input type="checkbox" checked={show} onChange={event=>setShow(event.target.checked)}/>{t.shell.showPin}</label>}
   {!register&&<label className="check-row"><input type="checkbox" checked={remember} onChange={event=>setRemember(event.target.checked)}/>{copy.remember}</label>}
   {error&&<StateBox title={error} error/>}
   <Button primary type="submit" className="w-full" disabled={busy}>{busy?t.loading:register?copy.register:otp&&!otpSent?copy.send:t.signIn}<Icon name="chevron"/></Button>
   <Button type="button" disabled={busy} onClick={()=>{setRegister(!register);setOtp(false);setLongPin(false);setNotice('');resetCode();}}>{register?t.signIn:copy.register}</Button>
   {!register&&!otp&&<Button type="button" disabled={busy} onClick={()=>{setLongPin(!longPin);resetCode();}}>{longPin?copy.useSix:copy.useLong}</Button>}
   {!register&&otpEnabled&&<Button type="button" disabled={busy} onClick={()=>{setOtp(!otp);resetCode();}}>{otp?copy.usePin:copy.useOtp}</Button>}
  </form>}
  <div className="panel login-access"><Icon name="help"/><p>{t.shell.needAccess}</p></div><p className="login-footer">{t.intro}</p>
 </section>;
}
