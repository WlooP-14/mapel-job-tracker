'use client';

import { useEffect, useState } from 'react';
import { planWorkbook } from '../lib/plan-export';
import { downloadBlob } from '../lib/export';
import { Button } from './ui';

export default function PlanExport({ job, data, t, blocked }) {
 const [prepared, setPrepared] = useState(null);
 const [shareError, setShareError] = useState(false);
 const copy = t.planning.planExport;

 useEffect(() => {
  let current = true;
  async function prepare() {
   try {
    const { default: writeExcel } = await import('write-excel-file/browser');
    const blob = await writeExcel(planWorkbook(job, data, t)).toBlob();
    const code = job.mould_code.replace(/[^a-zA-Z0-9._-]/g, '_');
    const file = new File([blob], code + '_Work_Plan.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (current) setPrepared({ job, data, t, file });
   } catch {
    if (current) setPrepared({ job, data, t, error: true });
   }
  }
  prepare();
  return () => { current = false; };
 }, [job, data, t]);

 const result = prepared?.job === job && prepared.data === data && prepared.t === t ? prepared : null;
 const file = result?.file;
 const canShare = Boolean(file && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }));

 async function share() {
  setShareError(false);
  try {
   await navigator.share({ files: [file], title: job.mould_code });
  } catch (error) {
   if (error.name !== 'AbortError') setShareError(true);
  }
 }

 return (
  <section className="panel space-y-3">
   <h3>{copy.title}</h3>
   <div className="flex flex-wrap gap-3">
    <Button type="button" disabled={blocked || !file} onClick={() => downloadBlob(file, file.name)}>{copy.download}</Button>
    {canShare && <Button type="button" disabled={blocked} onClick={share}>{copy.share}</Button>}
   </div>
   {!result && <p role="status">{t.loading}</p>}
   {result?.error && <p role="alert">{copy.exportError}</p>}
   {shareError && <p role="alert">{copy.shareError}</p>}
  </section>
 );
}
