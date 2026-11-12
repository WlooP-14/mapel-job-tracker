import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ensureRegistrationProfile} from '../lib/self-registration.js';

const user={id:'00000000-0000-0000-0000-000000000801',phone:'919999999999',app_metadata:{mjt_self_registration:true},user_metadata:{full_name:'Test Applicant',role:'admin'}};

test('registration creates only a pending viewer and preserves existing approved profiles on retry',async()=>{
 const records=new Map();
 const client={from:table=>{assert.equal(table,'users');return {upsert:async(row,options)=>{
  assert.deepEqual(options,{onConflict:'id',ignoreDuplicates:true});
  if(!records.has(row.id))records.set(row.id,row);
  return {error:null};
 }}}};
 await ensureRegistrationProfile(client,user);
 assert.deepEqual(records.get(user.id),{id:user.id,name:'Test Applicant',phone:'+919999999999',role:'viewer',active:false});
 records.set(user.id,{...records.get(user.id),role:'operator',active:true});
 await ensureRegistrationProfile(client,user);
 assert.equal(records.get(user.id).role,'operator');
 assert.equal(records.get(user.id).active,true);
});

test('registration rejects missing trusted metadata and surfaces profile storage failure',async()=>{
 await assert.rejects(ensureRegistrationProfile({}, {...user,app_metadata:{}}),/Invalid self-registration/);
 await assert.rejects(ensureRegistrationProfile({from:()=>({upsert:async()=>({error:{message:'private diagnostic'}})})},user),/profile could not be saved/);
});
