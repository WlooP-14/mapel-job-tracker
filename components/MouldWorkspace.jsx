'use client';
import {useCallback,useEffect,useState} from 'react';
import {loadMoulds} from '../lib/data';
import {syncCompleteEvent} from '../lib/offline-sync';
import {Button,Field,inputClass} from './ui';
import NewMould from './NewMould';
import MouldDetail from './MouldDetail';
import {MouldCard} from './MouldCards';
import ManagerOverview from './ManagerOverview';
import ScanBoxLabel from './ScanBoxLabel';
import {StateBox,Icon} from './Shell';
export default function MouldWorkspace({client,profile,t,view,onDetailChange}){
 const w=t.workflow;const [jobs,setJobs]=useState([]),[customers,setCustomers]=useState([]),[readiness,setReadiness]=useState([]),[selected,setSelected]=useState(null),[creating,setCreating]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState('active'),[group,setGroup]=useState('mould');
 const canEdit=['developer','admin','operator'].includes(profile.role);
 const [scanning,setScanning]=useState(false);
 useEffect(()=>{window.scrollTo(0,0)},[selected?.id,creating,scanning]);
 const refresh=useCallback(async()=>{try{const data=await loadMoulds(client);setJobs(data.jobs);setCustomers(data.customers);setReadiness(data.readiness);setSelected(old=>old?data.jobs.find(j=>j.id===old.id)||null:null);setError('');}catch{setError(t.shell.readError)}finally{setLoading(false)}},[client,t.shell.readError]);
 useEffect(()=>{window.addEventListener(syncCompleteEvent,refresh);window.addEventListener('online',refresh);return()=>{window.removeEventListener(syncCompleteEvent,refresh);window.removeEventListener('online',refresh);};},[refresh]);
 useEffect(()=>{let timer;const changed=()=>{clearTimeout(timer);timer=setTimeout(refresh,200)};refresh();const channel=client.channel('mould-list:'+profile.id).on('postgres_changes',{event:'*',schema:'public',table:'jobs'},changed).on('postgres_changes',{event:'*',schema:'public',table:'bom_items'},changed).on('postgres_changes',{event:'*',schema:'public',table:'part_steps'},changed).subscribe();return()=>{clearTimeout(timer);client.removeChannel(channel);};},[client,profile.id,refresh]);
 useEffect(()=>{onDetailChange?.(Boolean(selected||creating));return()=>onDetailChange?.(false)},[selected?.id,creating,onDetailChange]);
 useEffect(()=>{let active=true;async function fromUrl(){const id=new URLSearchParams(window.location.search).get('mould');if(!id){setSelected(null);return;}if(!/^[0-9a-f-]{36}$/i.test(id))return;const {data,error}=await client.from('jobs').select('id,mould_code,name,customer_id,trial_date_t0,status,priority').eq('id',id).is('archived_at',null).maybeSingle();if(active){if(error||!data)setError(t.invalid);else setSelected(data);}}fromUrl();window.addEventListener('popstate',fromUrl);return()=>{active=false;window.removeEventListener('popstate',fromUrl);};},[client,t.invalid]);
 function open(job){setSelected(job);const url=new URL(window.location.href);url.searchParams.set('mould',job.id);window.history.pushState(null,'',url);}
 function back(){setSelected(null);const url=new URL(window.location.href);url.searchParams.delete('mould');window.history.pushState(null,'',url);refresh();}
 if(creating)return <NewMould client={client} profile={profile} customers={customers} t={t} onCancel={()=>setCreating(false)} onCreated={job=>{setCreating(false);open(job);refresh();}}/>;
 if(selected)return <MouldDetail key={selected.id} client={client} profile={profile} job={selected} customers={customers} customer={customers.find(c=>c.id===selected.customer_id)?.name} t={t} onBack={back} onUpdated={refresh}/>;
 if(scanning)return <ScanBoxLabel jobs={jobs} t={t} loading={loading} loadError={error} onRetry={refresh} onBack={()=>setScanning(false)} onOpen={job=>{setScanning(false);open(job);}}/>;
 const getReady=job=>readiness.find(r=>r.job_id===job.id)||{parts_total:0,parts_ready:0};
 const customerName=id=>customers.find(c=>c.id===id)?.name||w.noCustomer;
 const shown=jobs.filter(job=>(view==='dashboard'?job.status==='active':filter==='all'||job.status===filter)&&[job.mould_code,job.name,customerName(job.customer_id)].join(' ').toLowerCase().includes(search.toLowerCase())).sort((a,b)=>{
  if(group==='customer')return customerName(a.customer_id).localeCompare(customerName(b.customer_id))||(a.trial_date_t0||'9999').localeCompare(b.trial_date_t0||'9999');
  if(view==='dashboard'){const ar=getReady(a),br=getReady(b),ratio=r=>r.parts_total?Number(r.parts_ready)/Number(r.parts_total):0;return ratio(ar)-ratio(br)||(a.trial_date_t0||'9999').localeCompare(b.trial_date_t0||'9999');}
  return (a.trial_date_t0||'9999').localeCompare(b.trial_date_t0||'9999');
 });
 return <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="page-title">{view==='dashboard'?t.dashboard:t.moulds}</h2>{canEdit&&<Button primary onClick={()=>setCreating(true)}><Icon name="plus"/>{w.newMould}</Button>}</div><p className="muted">{t.intro}</p>
 {view==='moulds'&&<Button onClick={()=>setScanning(true)}>{t.boxLabels.scan}</Button>}
 {view==='dashboard'&&!loading&&!error&&['developer','admin'].includes(profile.role)&&<ManagerOverview client={client} jobs={jobs} getReady={getReady} customerName={customerName} onOpen={open} t={t}/>}
 <Field label={w.search}>{id=><input type="search" id={id} className={inputClass} value={search} onChange={e=>setSearch(e.target.value)}/>}</Field>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{view!=='dashboard'&&<Field label={w.filter}>{id=><select id={id} className={inputClass} value={filter} onChange={e=>setFilter(e.target.value)}>{['all','active','on_hold','finished'].map(v=><option key={v} value={v}>{v==='all'?w.allMoulds:w.states[v]}</option>)}</select>}</Field>}<Field label={w.viewBy}>{id=><select id={id} className={inputClass} value={group} onChange={e=>setGroup(e.target.value)}><option value="mould">{w.byMould}</option><option value="customer">{w.byCustomer}</option></select>}</Field></div>
 {error?<StateBox error title={error} action={<Button onClick={refresh}>{w.retry}</Button>}/>:loading?<StateBox title={t.loading}/>:!shown.length?<StateBox title={t.empty} detail={canEdit?w.emptyAction:w.viewerEmpty}/>:<div className="space-y-4">{shown.map((job,i)=><div key={job.id}>{group==='customer'&&(i===0||shown[i-1].customer_id!==job.customer_id)&&<h3 className="mb-3">{customerName(job.customer_id)}</h3>}<MouldCard job={job} customer={customerName(job.customer_id)} ready={getReady(job)} t={t} onOpen={()=>open(job)}/></div>)}</div>}
 </section>;
}
