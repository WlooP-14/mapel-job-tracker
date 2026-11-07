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
 const sixDigits=otp||!longPin;

 function resetCode(){setPin('');setError('');setOtpSent(false);}
 async function submit(event){
  event.preventDefault();
  setBusy(true);setError('');
  try{
   const number=indiaPhone(phone);
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
   <div className="section-heading"><h2>{t.signIn}</h2><span className="plain-badge">{t.shell.privatePin}</span></div>
   <p className="muted">{copy.invite}</p>
   <Field label={t.phone} hint={copy.phoneHint}>{id=><div className="flex items-center gap-2"><span className="plain-badge">+91</span><input id={id} type="tel" autoComplete="tel-national" className={inputClass} value={phone} onChange={event=>{setPhone(indiaPhoneDigits(event.target.value));resetCode();}} required pattern="[0-9]{10}" disabled={busy}/></div>}</Field>
   {(!otp||otpSent)&&<Field label={otp?copy.code:longPin?t.pin:copy.pin}>{id=><div className={sixDigits?'login-pin-grid':undefined}>
    {sixDigits&&<div className="login-pin-boxes" aria-hidden="true">{Array.from({length:6},(_,index)=><span key={index}>{pin[index]&&(show||otp?pin[index]:'●')}</span>)}</div>}
    <input id={id} className={sixDigits?'login-pin-input':inputClass} type={show||otp?'text':'password'} autoComplete={otp?'one-time-code':'current-password'} inputMode="numeric" pattern={sixDigits?'[0-9]{6}':'[0-9]{8,12}'} maxLength={sixDigits?6:12} value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,''))} required disabled={busy}/>
   </div>}</Field>}
   {!otp&&<label className="check-row"><input type="checkbox" checked={show} onChange={event=>setShow(event.target.checked)}/>{t.shell.showPin}</label>}
   <label className="check-row"><input type="checkbox" checked={remember} onChange={event=>setRemember(event.target.checked)}/>{copy.remember}</label>
   {error&&<StateBox title={error} error/>}
   <Button primary type="submit" className="w-full" disabled={busy}>{busy?t.loading:otp&&!otpSent?copy.send:t.signIn}<Icon name="chevron"/></Button>
   {!otp&&<Button type="button" disabled={busy} onClick={()=>{setLongPin(!longPin);resetCode();}}>{longPin?copy.useSix:copy.useLong}</Button>}
   {otpEnabled&&<Button type="button" disabled={busy} onClick={()=>{setOtp(!otp);resetCode();}}>{otp?copy.usePin:copy.useOtp}</Button>}
  </form>}
  <div className="panel login-access"><Icon name="help"/><p>{t.shell.needAccess}</p></div><p className="login-footer">{t.intro}</p>
 </section>;
}
