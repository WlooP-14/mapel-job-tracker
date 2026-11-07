'use client';
import {useEffect,useState} from 'react';
import {messages} from '../locales/messages';
import {Button} from '../components/ui';
export default function ErrorPage({retry}){
 const [language,setLanguage]=useState('en');useEffect(()=>{const value=document.documentElement.lang;if(messages[value])setLanguage(value)},[]);const t=messages[language];
 return <main className="app-shell app-content"><h1 className="page-title">{t.app}</h1><section className="panel mt-5 space-y-4" role="alert"><h2>{t.editMould.errorTitle}</h2><p className="muted">{t.editMould.errorHint}</p><Button primary onClick={()=>retry()}>{t.shell.retry}</Button></section></main>;
}
