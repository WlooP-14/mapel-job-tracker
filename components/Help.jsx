'use client';
import ActionGuide, {guideLabel,guideTitles} from './ActionGuide';
import {Section} from './Shell';
import {Button,StatusPill} from './ui';
export default function Help({t,onTour}){
 const h=t.shell;
 return <div className="space-y-5"><div><h2 className="page-title">{h.helpTitle}</h2><p className="muted mt-2">{h.helpIntro}</p></div><p className="muted">{t.guides.access}</p>{Object.entries(guideTitles).map(([topic,path])=><ActionGuide key={topic} t={t} topic={topic} title={guideLabel(t,path)}/>)}<Section title={t.statusLabel} icon="help">{t.statuses.map((label,i)=><div className="status-explanation" key={label}><StatusPill status={i} label={label}/><p>{h.statusDescriptions[i]}</p></div>)}</Section><Section title={t.tour} hint={t.tourHelp} icon="help"><Button onClick={onTour} className="w-full"><Icon name="clock"/>{h.replayTour}</Button></Section></div>;
}
