'use client';
import {useCallback,useEffect,useState} from 'react';
import {Button} from './ui';
import {Section,StateBox} from './Shell';
export default function BomFiles({client,job,t,version,onUseFile}){
 const b=t.bom;const [sheets,setSheets]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{setLoading(true);setError('');try{const result=await client.from('bom_sheets').select('*').eq('job_id',job.id).is('archived_at',null).order('revision_no',{ascending:false});if(result.error)throw result.error;setSheets(result.data);}catch{setError(b.readError)}finally{setLoading(false)}},[client,job.id,b.readError]);
 useEffect(()=>{load()},[load,version]);
 async function useFile(source){
  setBusy(true);
  setError('');
  try {
   const result=await client.storage.from('bom-sources').download(source.path);
   if(result.error)throw result.error;
   onUseFile({...source,file:new File([result.data],source.name,{type:result.data.type})});
  }catch{setError(b.readError)}finally{setBusy(false);}
 }
 const sources=[...new Set(sheets.map(s=>s.source_image).filter(Boolean))];
 return <Section title={b.files}>{loading?<StateBox title={t.loading}/>:error?<StateBox title={error} error action={<Button onClick={load}>{t.workflow.retry}</Button>}/>:!sources.length?<p className="muted">{b.noFiles}</p>:sources.map(path=>{
 const attachment=sheets.find(sheet=>sheet.source_image===path&&sheet.revision_no===0);
 const row=attachment||sheets.find(sheet=>sheet.source_image===path);
 const name=attachment?.title||path.split('/').at(-1).replace(/^[0-9a-f-]{36}-/i,'');
 const partsAdded=sheets.some(sheet=>sheet.source_image===path&&sheet.import_id);
 return (
  <div className="data-row flex-wrap" key={path}>
   <p className="w-full break-all font-bold">{name}</p>
   <p className="muted">{partsAdded?b.filePartsAdded:b.fileAttached}</p>
   <div className="flex flex-wrap gap-2">
    {onUseFile&&<Button type="button" disabled={busy} onClick={()=>useFile({id:row.id,path,name})}>{b.useFile}</Button>}
   </div>
  </div>
 );
})}</Section>;
}
