'use client';
import {Button,buttonClass} from './ui';
import {StateBox} from './Shell';

export default function DeveloperLoadState({t,errorCode,busy,onRetry,onDownload,sqlEditorUrl}){
 const d=t.developer;
 if(!errorCode)return <StateBox title={t.loading}/>;
 const missing=errorCode==='SECURITY_NOT_CONFIGURED';
 return <section className="space-y-4">
  <StateBox error title={d.errors[errorCode]||d.errors.SECURITY_FAILED} detail={missing?d.setupMissing:undefined}/>
  {missing&&<div className="panel space-y-4"><ol className="list-decimal pl-5 space-y-3">{d.setupSteps.map(step=><li key={step}>{step}</li>)}</ol><p className="muted">{d.setupSafe}</p><Button className="w-full" disabled={busy} onClick={onDownload}>{d.setupDownload}</Button>{sqlEditorUrl&&<a className={buttonClass+' w-full'} href={sqlEditorUrl} target="_blank" rel="noopener noreferrer">{d.setupOpenSql}</a>}</div>}
  <Button disabled={busy} onClick={onRetry}>{d.refresh}</Button>
 </section>;
}
