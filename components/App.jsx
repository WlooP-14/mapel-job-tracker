'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import {messages} from '../locales/messages';
import Login from './Login';
import Help from './Help';
import Settings from './Settings';
import Tour from './Tour';
import MouldWorkspace from './MouldWorkspace';
import {Vendors,Alerts} from './Directories';
import {AppHeader,BottomNav,StateBox} from './Shell';
import {Button} from './ui';
export default function App(){
 const [lang,setLang]=useState('en'),[tour,setTour]=useState(-1),[page,setPage]=useState('dashboard'),[session,setSession]=useState(null),[authLoading,setAuthLoading]=useState(true),[profile,setProfile]=useState(null),[profileError,setProfileError]=useState(false),[notice,setNotice]=useState(''),[offline,setOffline]=useState(false);
 const [mouldOpen,setMouldOpen]=useState(false);
 useEffect(()=>{window.scrollTo(0,0)},[page,profile?.id]);
 const languageVersion=useRef(0);const t=messages[lang];
 const [client]=useState(()=>{const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;return url&&key?createClient(url,key):null;});
 useEffect(()=>{document.documentElement.lang=lang;},[lang]);
 useEffect(()=>{const value=localStorage.getItem('mjt-language');if(messages[value])setLang(value);if('serviceWorker'in navigator){if(['localhost','127.0.0.1'].includes(location.hostname)){navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(registrations.filter(r=>r.active?.scriptURL.endsWith('/sw.js')).map(r=>r.unregister()))).catch(()=>{});if('caches'in window)caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('mould-shell-')).map(k=>caches.delete(k)))).catch(()=>{});}else navigator.serviceWorker.register('/sw.js').catch(()=>{});}const update=()=>setOffline(!navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);}},[]);
 useEffect(()=>{if(!client){setAuthLoading(false);return;}let active=true;client.auth.getSession().then(({data,error})=>{if(active){setSession(error?null:data.session);setAuthLoading(false);}}).catch(()=>{if(active)setAuthLoading(false)});const {data:{subscription}}=client.auth.onAuthStateChange((_event,s)=>{setSession(s);setAuthLoading(false);});return()=>{active=false;subscription.unsubscribe();};},[client]);
 const loadProfile=useCallback(async()=>{if(!session||!client){setProfile(null);return;}setProfile(old=>old&&old.id!==session.user.id?null:old);setProfileError(false);try{const result=await client.from('users').select('id,name,phone,role,active,archived_at').eq('id',session.user.id).maybeSingle();if(result.error)throw result.error;setProfile(result.data?.active&&!result.data.archived_at?result.data:false);}catch{setProfileError(true);}},[client,session?.user?.id,session?.access_token]);
 useEffect(()=>{loadProfile();if(!session)return;const visible=()=>{if(document.visibilityState==='visible')loadProfile()};const timer=setInterval(visible,15000);document.addEventListener('visibilitychange',visible);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible)}},[loadProfile,Boolean(session)]);
 useEffect(()=>{if(!profile?.id)return;let active=true;const version=languageVersion.current;client.from('user_prefs').select('language').eq('user_id',profile.id).maybeSingle().then(({data})=>{if(active&&version===languageVersion.current&&messages[data?.language])setLang(data.language);});if(!localStorage.getItem(`mjt-tour:${profile.id}`))setTour(0);return()=>{active=false;};},[client,profile?.id]);
 async function changeLang(e){languageVersion.current++;const value=e.target.value;setLang(value);localStorage.setItem('mjt-language',value);if(profile?.id){try{const r=await client.from('user_prefs').upsert({user_id:profile.id,language:value});if(r.error)throw r.error;setNotice('');}catch{setNotice(t.invalid);}}}
 function endTour(){setTour(-1);if(profile?.id)localStorage.setItem(`mjt-tour:${profile.id}`,'done');}
 function navigate(key){setPage(key);setNotice('');if(['dashboard','moulds'].includes(key)){const url=new URL(location.href);url.searchParams.delete('mould');history.pushState(null,'',url);}}
 async function logout(){try{const {error}=await client.auth.signOut();if(error)throw error;setProfile(null);setPage('dashboard');setTour(-1);}catch{setNotice(t.invalid);}}
 const signedIn=Boolean(session&&profile);let content;
 if(authLoading)content=<StateBox title={t.loading}/>;
 else if(!session)content=<Login client={client} t={t}/>;
 else if(profileError)content=<StateBox title={t.shell.profileLoadError} action={<div className="flex gap-3"><Button onClick={loadProfile}>{t.shell.retry}</Button><Button onClick={logout}>{t.logout}</Button></div>} error/>;
 else if(profile===false)content=<StateBox title={t.noAccess} action={<Button onClick={logout}>{t.logout}</Button>}/>;
 else if(!profile)content=<StateBox title={t.loading}/>;
 else if(page==='settings')content=<Settings client={client} profile={profile} t={t} language={lang} onLanguage={changeLang} onTour={()=>setTour(0)} onLogout={logout}/>;
 else if(page==='help')content=<Help t={t} onTour={()=>setTour(0)}/>;
 else if(page==='vendors')content=<Vendors client={client} profile={profile} t={t}/>;
 else if(page==='alerts')content=<Alerts client={client} t={t}/>;
 else content=<MouldWorkspace onDetailChange={setMouldOpen} key={page} client={client} profile={profile} t={t} view={page}/>;
 return <div className="app-shell"><AppHeader t={t} language={lang} onLanguage={changeLang} onNavigate={navigate} signedIn={signedIn}/>{(offline||notice)&&<p role="status" className="app-notice">{offline?t.shell.offline:notice}</p>}<main className="app-content">{content}</main>{signedIn&&tour>=0&&<Tour step={tour} t={t} onClose={endTour} onBack={()=>setTour(s=>Math.max(0,s-1))} onNext={()=>tour===t.shell.tourSteps.length-1?endTour():setTour(s=>s+1)}/>} {signedIn&&<BottomNav page={mouldOpen?'moulds':page} onNavigate={navigate} t={t}/>}</div>;
}
