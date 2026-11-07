'use client';
import {useEffect,useRef} from 'react';
import {Icon} from './Shell';
import {Button} from './ui';
export default function Tour({step,t,onClose,onNext,onBack}){
 const ref=useRef(null);const content=t.shell.tourSteps[step];
 useEffect(()=>{const dialog=ref.current,previous=document.activeElement;dialog.showModal();return()=>{dialog.close();previous?.focus();};},[]);
 return <dialog ref={ref} onCancel={e=>{e.preventDefault();onClose();}} aria-labelledby="tour-title" aria-describedby="tour-detail" className="tour-dialog"><div className="tour-progress"><strong>{t.shell.stepOf.replace('{step}',step+1).replace('{total}',t.shell.tourSteps.length)}</strong><button onClick={onClose}>{t.skip}</button></div><div className="tour-body"><span className="small-icon"><Icon name={content.icon}/></span><div><h2 id="tour-title">{content.title}</h2><p id="tour-detail" aria-live="polite">{content.body}</p></div></div><div className="tour-actions"><Button onClick={onBack} disabled={step===0}>{t.workflow.back}</Button><Button primary onClick={onNext}>{step===t.shell.tourSteps.length-1?t.finish:t.next}</Button></div></dialog>;
}
