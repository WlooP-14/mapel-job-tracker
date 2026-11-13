import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {messages} from '../locales/messages.js';
import {componentModule} from './helpers/render-jsx.mjs';
import 'fake-indexeddb/auto';
import {saveDraft,loadDraft,clearLocalDrafts} from '../lib/drafts.js';

test('developer panel and navigation remain hidden for other roles in every language',async()=>{
 const {default:Panel}=await componentModule('components/DeveloperPanel.jsx'),{AppHeader}=await componentModule('components/Shell.jsx');
 for(const t of Object.values(messages))for(const role of ['viewer','operator','admin','developer']){
  const html=renderToStaticMarkup(React.createElement(Panel,{client:{},profile:{role},t}));
  const header=renderToStaticMarkup(React.createElement(AppHeader,{t,language:'en',signedIn:true,isDeveloper:role==='developer'}));
  if(role==='developer'){assert.ok(html.includes(t.developer.title));assert.ok(header.includes(t.developer.title));}else{assert.equal(html,'');assert.ok(!header.includes(t.developer.title));}
 }
});
test('confirmed wipe cleanup removes all accounts cached reads and queued offline changes',async()=>{
 await saveDraft('reads:alice',[{secret:'cached row'}]);await saveDraft('queue:bob',[{id:'unsynced'}]);
 await clearLocalDrafts();assert.equal(await loadDraft('reads:alice'),undefined);assert.equal(await loadDraft('queue:bob'),undefined);
});

test('failed security loading shows recovery steps without an indefinite waiting message in every language',async()=>{
 const {default:LoadState}=await componentModule('components/DeveloperLoadState.jsx');
 for(const t of Object.values(messages)){
  for(const errorCode of ['SECURITY_NOT_CONFIGURED','SECURITY_FAILED']){
   const html=renderToStaticMarkup(React.createElement(LoadState,{t,errorCode,sqlEditorUrl:'https://supabase.com/dashboard/project/test/sql/new'}));
   assert.ok(!html.includes(t.loading));assert.ok(html.includes(t.developer.errors[errorCode]));
   assert.equal(html.includes(t.developer.setupDownload),errorCode==='SECURITY_NOT_CONFIGURED');
   if(errorCode==='SECURITY_NOT_CONFIGURED')for(const step of t.developer.setupSteps)assert.ok(html.includes(step));
  }
  assert.ok(renderToStaticMarkup(React.createElement(LoadState,{t})).includes(t.loading));
 }
});
