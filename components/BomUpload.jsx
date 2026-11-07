'use client';

import { useRef, useState } from 'react';
import { Button } from './ui';
import { Icon, StateBox } from './Shell';

const mimeTypes = {
 pdf: 'application/pdf',
 xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 png: 'image/png',
 jpg: 'image/jpeg',
 jpeg: 'image/jpeg',
 webp: 'image/webp'
};

export default function BomUpload({ client, job, t, onBack, onSaved }) {
 const input = useRef(null);
 const saving = useRef(false);
 const [files, setFiles] = useState([]);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const b = t.bom;

 function choose(event) {
  const selected = Array.from(event.currentTarget.files || []);
  event.currentTarget.value = '';
  if (!selected.length) return;
  const entries = selected.map(file => ({
   file,
   id: crypto.randomUUID(),
   type: Object.entries(mimeTypes).find(([extension]) => file.name.toLowerCase().endsWith('.' + extension))?.[1]
  }));
  if (entries.some(entry => !entry.type)) {
   setFiles([]);
   setError(b.fileInvalid);
   return;
  }
  if (entries.some(entry => entry.file.size > 10485760)) {
   setFiles([]);
   setError(b.fileTooLarge);
   return;
  }
  setError('');
  setFiles(entries);
 }

 async function save() {
  if (!files.length || saving.current) return;
  saving.current = true;
  setBusy(true);
  setError('');
  try {
   const records = [];
   for (const { file, id, type } of files) {
    const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
    const path = `${job.id}/${id}/${id}-${filename}`;
    const upload = await client.storage.from('bom-sources').upload(path, file, { contentType: type, upsert: false });
    if (upload.error && String(upload.error.statusCode) !== '409') throw upload.error;
    // Revision zero is a source-only record and carries no section sign-off.
    records.push({ id, job_id: job.id, section: 'base', revision_no: 0, title: file.name, source_image: path });
   }
   const result = await client.from('bom_sheets').upsert(records, { onConflict: 'id', ignoreDuplicates: true });
   if (result.error) throw result.error;
   onSaved();
  } catch {
   setError(b.uploadFailed);
  } finally {
   saving.current = false;
   setBusy(false);
  }
 }

 return (
  <section className="space-y-5">
   <Button type="button" disabled={busy} onClick={onBack}><Icon name="back"/>{t.workflow.back}</Button>
   <h2 className="page-title">{b.addBom}</h2>
   <p className="font-bold">{job.mould_code} · {job.name}</p>
   <input ref={input} type="file" multiple hidden disabled={busy}
    accept={Object.keys(mimeTypes).map(extension => '.' + extension).join(',')}
    onChange={choose}/>
   <Button type="button" className="w-full" primary={!files.length} disabled={busy} onClick={() => input.current?.click()}>
    <Icon name="plus"/>{files.length ? b.changeFiles : b.addFiles}
   </Button>
   <p className="muted">{b.fileFormats}</p>
   {files.length > 0 && (
    <ul className="panel space-y-2" aria-live="polite">
     {files.map(({ file, id }) => <li key={id} className="break-all">{file.name}</li>)}
    </ul>
   )}
   {error && <StateBox title={error} error/>}
   <Button type="button" className="w-full" primary={files.length > 0} disabled={!files.length || busy} onClick={save}>
    <Icon name="check"/>{busy ? t.loading : b.confirm}
   </Button>
  </section>
 );
}
