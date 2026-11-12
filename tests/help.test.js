import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {messages} from '../locales/messages.js';
import {helpSections} from '../lib/help-guide.js';
import {componentModule} from './helpers/render-jsx.mjs';

test('the real Help page renders its entire workflow and replay-tour icon without crashing in every language',async()=>{
 const {default:Help}=await componentModule('components/Help.jsx');
 for(const t of Object.values(messages)){
  const html=renderToStaticMarkup(React.createElement(Help,{t,onTour:()=>{},onNavigate:()=>{}}));
  assert.ok(html.includes(t.manual.introTitle));
  assert.ok(html.includes(t.shell.replayTour));
  for(const {id}of helpSections){assert.ok(html.includes(`href="#help-${id}"`));assert.ok(html.includes(`id="help-${id}"`));assert.ok(html.includes(t.manual.chapters[id].title));}
  assert.ok(html.includes('<svg'));
 }
});

test('every guide step has translated instructions and references an existing translated app button',()=>{
 for(const t of Object.values(messages)){
  assert.equal(t.manual.flow.length,9);
  for(const {id,actions}of helpSections){
   const chapter=t.manual.chapters[id];
   assert.equal(chapter.steps.length,actions.length,id);
   assert.ok(chapter.steps.every(step=>typeof step==='string'&&step.trim().length>20));
   for(const action of actions.filter(Boolean))assert.equal(typeof action.split('.').reduce((value,key)=>value?.[key],t),'string',action);
  }
 }
});
