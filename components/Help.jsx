'use client';
import {guideLabel} from './ActionGuide';
import {Icon,Section} from './Shell';
import {Button,StatusPill,buttonClass} from './ui';
import {helpSections} from '../lib/help-guide';

export default function Help({t,onTour,onNavigate}){
 const h=t.shell,m=t.manual;
 return <div className="space-y-5 help-guide">
  <h2 className="page-title">{h.helpTitle}</h2>
  <Section title={m.introTitle} icon="help">
   <div className="space-y-3 mt-3">{m.intro.map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div>
   {onNavigate&&<div className="flex flex-wrap gap-3 mt-4"><Button onClick={()=>onNavigate('moulds')}>{t.moulds}</Button><Button onClick={()=>onNavigate('settings')}>{t.settings}</Button></div>}
  </Section>
  <Section title={m.flowTitle} icon="moulds"><ol className="help-flow">{m.flow.map((step,index)=><li key={index}><span className="plain-badge" aria-hidden="true">{index+1}</span><span>{step}</span></li>)}</ol></Section>
  <nav className="panel" aria-label={m.contents}><h3>{m.contents}</h3><div className="help-contents mt-3">{helpSections.map(({id})=><a key={id} className={buttonClass} href={'#help-'+id}>{m.chapters[id].title}</a>)}</div></nav>
  {helpSections.map(({id,actions})=>{
   const chapter=m.chapters[id];
   return <div id={'help-'+id} className="help-chapter" key={id}><Section title={chapter.title} hint={chapter.intro} icon="file"><ol className="help-steps">{actions.map((action,index)=><li key={index}>{action&&<strong className="block mb-1">{guideLabel(t,action)}</strong>}<p>{chapter.steps[index]}</p></li>)}</ol></Section></div>;
  })}
  <Section title={t.statusLabel} icon="help">{t.statuses.map((label,index)=><div className="status-explanation" key={label}><StatusPill status={index} label={label}/><p>{h.statusDescriptions[index]}</p></div>)}</Section>
  <Section title={t.tour} hint={t.tourHelp} icon="help"><Button onClick={onTour} className="w-full"><Icon name="clock"/>{h.replayTour}</Button></Section>
 </div>;
}
