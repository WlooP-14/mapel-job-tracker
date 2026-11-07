'use client';

import { useEffect, useState } from 'react';
import { businessDate } from '../lib/scheduling';
import { loadOverviewData, summarizeOverview } from '../lib/overview';
import { MouldCard } from './MouldCards';
import { StateBox } from './Shell';
import { Button } from './ui';

export default function ManagerOverview({ client, jobs, getReady, customerName, onOpen, t }) {
 const [open, setOpen] = useState(false);
 const [data, setData] = useState(null);
 const [error, setError] = useState(false);
 const [retry, setRetry] = useState(0);
 const [printing, setPrinting] = useState(false);
 const today = businessDate();
 const copy = t.overview;

 useEffect(() => {
  if (!open) return;
  let current = true;
  setData(null);
  setError(false);
  const activeIds = jobs.filter(job => job.status === 'active').map(job => job.id);
  loadOverviewData(client, activeIds, today).then(result => {
   if (current) setData(result);
  }).catch(() => {
   if (current) setError(true);
  });
  return () => { current = false; };
 }, [client, jobs, open, retry, today]);

 useEffect(() => {
  if (!printing) return;
  const finish = () => setPrinting(false);
  window.addEventListener('afterprint', finish);
  const timer = setTimeout(() => window.print(), 100);
  return () => {
   clearTimeout(timer);
   window.removeEventListener('afterprint', finish);
  };
 }, [printing]);

 const report = data && summarizeOverview(jobs, data.stages, data.vendors, data.holidays, today);
 function readiness(job) {
  const record = getReady(job);
  return record.parts_total ? record.parts_ready / record.parts_total : 0;
 }

 return (
  <details className={printing ? 'panel manager-print' : 'panel'} onToggle={event => setOpen(event.currentTarget.open)}>
   <summary className="font-bold cursor-pointer">{copy.title}</summary>
   {open && (error
    ? <StateBox error title={t.shell.readError} action={<Button onClick={() => setRetry(value => value + 1)}>{t.shell.retry}</Button>}/>
    : !report
     ? <StateBox title={t.loading}/>
     : <div className="space-y-4">
       <p>{copy.range.replace('{today}', today).replace('{lastDay}', report.lastDay)}</p>
       <dl className="grid gap-2 sm:grid-cols-3">
        {[[copy.active, report.active], [copy.late, report.late], [copy.upcoming, report.upcoming.length]].map(([label, count]) => (
         <div className="panel" key={label}><dt>{label}</dt><dd className="text-2xl font-bold">{count}</dd></div>
        ))}
       </dl>
       <h3>{copy.attention}</h3>
       {report.attention.length ? report.attention.sort((a,b) => readiness(a) - readiness(b) || (a.trial_date_t0 || '9999').localeCompare(b.trial_date_t0 || '9999')).map(job => (
        <MouldCard key={job.id} job={job} customer={customerName(job.customer_id)} ready={getReady(job)} t={t} onOpen={() => onOpen(job)}/>
       )) : <p>{copy.noAttention}</p>}
       <h3>{copy.vendors}</h3>
       {report.vendorDelays.length ? report.vendorDelays.map(vendor => (
        <article className="panel" key={vendor.id}>
         <strong>{vendor.name || t.workflow.notSet}</strong>
         <p>{copy.count.replace('{count}', vendor.count)}</p>
         <p>{copy.average.replace('{days}', vendor.average.toFixed(1))}</p>
        </article>
       )) : <p>{copy.none}</p>}
       <Button className="w-full" onClick={() => setPrinting(true)}>{copy.print}</Button>
      </div>)}
  </details>
 );
}
