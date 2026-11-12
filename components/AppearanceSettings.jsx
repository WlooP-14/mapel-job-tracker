'use client';
import {Section} from './Shell';
import {Button} from './ui';
import {appearanceOptions} from '../lib/appearance';
export default function AppearanceSettings({t,value,onChange,busy,pending}){
 const a=t.appearance;
 return <Section title={a.title} hint={a.hint}><div className="appearance-options" role="group" aria-label={a.title}>{appearanceOptions.map(option=><Button key={option} type="button" aria-pressed={value===option} disabled={busy} onClick={()=>onChange(option)}>{a[option]}</Button>)}</div>{pending&&!busy&&<p role="status" className="muted mt-3">{a.pending}</p>}</Section>;
}
