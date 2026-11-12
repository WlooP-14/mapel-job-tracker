'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {applyAppearance,readAppearance,storeAppearance,validAppearance} from '../lib/appearance';

export default function useAppearance(client,session){
 const userId=session?.user?.id;
 const remote=session?.user?.user_metadata?.appearance;
 const [appearance,setAppearance]=useState('light'),[busy,setBusy]=useState(false),[pending,setPending]=useState(false);
 const activeUser=useRef(userId),version=useRef(0),saving=useRef(false),selection=useRef(null);
 activeUser.current=userId;
 useEffect(()=>{
  const choice=readAppearance(localStorage,userId,remote);
  selection.current={...choice,userId};setAppearance(choice.value);setPending(choice.pending);
 },[userId,remote]);
 useEffect(()=>{version.current++;},[userId]);
 useEffect(()=>{
  const media=window.matchMedia('(prefers-color-scheme: dark)');
  const apply=()=>applyAppearance(document,appearance,media.matches);
  apply();media.addEventListener('change',apply);
  return()=>media.removeEventListener('change',apply);
 },[appearance]);
 const sync=useCallback(async()=>{
  if(!client||!userId||saving.current||!navigator.onLine)return;
  const choice=selection.current;
  if(!choice?.pending||choice.userId!==userId)return;
  saving.current=true;setBusy(true);
  const revision=version.current;
  try{
   const current=await client.auth.getSession();
   if(current.data?.session?.user?.id!==userId||activeUser.current!==userId)return;
   const result=await client.auth.updateUser({data:{appearance:choice.value}});
   if(result.error)throw result.error;
   if(activeUser.current===userId&&revision===version.current){selection.current={...choice,pending:false};storeAppearance(localStorage,userId,choice.value,false);setPending(false);}
  }catch{/* Retain the user-specific choice and retry on reconnect. */}
  finally{saving.current=false;setBusy(false);}
 },[client,userId]);
 useEffect(()=>{
  if(pending)sync();
  const online=()=>sync();window.addEventListener('online',online);
  return()=>window.removeEventListener('online',online);
 },[pending,sync]);
 function change(value){
  if(!validAppearance(value)||busy)return;
  version.current++;
  selection.current={value,pending:Boolean(userId),userId};
  setAppearance(value);storeAppearance(localStorage,userId,value,Boolean(userId));setPending(Boolean(userId));
  // A previous pending save may already be scheduled; sync reads the latest local value.
  if(userId)queueMicrotask(sync);
 }
 return {appearance,change,busy,pending};
}
