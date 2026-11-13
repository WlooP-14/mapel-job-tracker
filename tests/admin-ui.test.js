import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {componentModule} from './helpers/render-jsx.mjs';
import {messages} from '../locales/messages.js';
import {adminEntities,canManageData,changedAdminFields} from '../lib/admin-records.js';

test('management controls render for admins and developers and are absent for operators and viewers',async()=>{
 const {default:Manager}=await componentModule('components/AdminDataManager.jsx');
 for(const t of Object.values(messages))for(const role of ['admin','developer','operator','viewer']){
  const html=renderToStaticMarkup(React.createElement(Manager,{client:{},profile:{id:'actor',role},t}));
  assert.equal(html.includes(t.admin.title),canManageData(role));
 }
});

test('record forms have translated business labels and never submit identifiers or unchanged values',()=>{
 for(const t of Object.values(messages))for(const [table,entity]of Object.entries(adminEntities)){
  assert.equal(typeof t.admin.entities[table],'string');
  for(const field of entity.fields)assert.equal(typeof field.label.split('.').reduce((value,key)=>value?.[key],t),'string',field.label);
 }
 assert.deepEqual(changedAdminFields('jobs',{id:'original',name:'Mould'},{id:'injected',name:'Mould'}),{});
 assert.deepEqual(changedAdminFields('jobs',{name:'Mould'},{id:'injected',name:'Corrected'}),{name:'Corrected'});
});
