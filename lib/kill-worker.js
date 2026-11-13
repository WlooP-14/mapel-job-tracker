import {verifyBackupReceipt} from './developer-security.js';

export async function removeLiveStorage(client,heartbeat){
 const buckets=await client.storage.listBuckets();if(buckets.error)throw Error('STORAGE_LIST_FAILED');
 for(const bucket of buckets.data){
  const store=client.storage.from(bucket.id);
  async function empty(prefix=''){
   let previous='';
   // Always use offset zero: removals shift subsequent pages to the front.
   for(;;){
    await heartbeat();
    const list=await store.list(prefix,{limit:100,offset:0,sortBy:{column:'name',order:'asc'}});
    if(list.error)throw Error('STORAGE_LIST_FAILED');
    if(!list.data.length)break;
    const fingerprint=JSON.stringify(list.data.map(object=>[object.id,object.name]));
    if(fingerprint===previous)throw Error('STORAGE_REMOVE_STALLED');
    previous=fingerprint;
    const files=[];
    for(const object of list.data){const path=prefix?prefix+'/'+object.name:object.name;if(!object.id)await empty(path);else files.push(path);}
    if(files.length){const removed=await store.remove(files);if(removed.error)throw Error('STORAGE_REMOVE_FAILED');}
   }
  }
  await empty();
  const removed=await client.storage.deleteBucket(bucket.id);if(removed.error)throw Error('STORAGE_BUCKET_FAILED');
 }
}
export async function removeLiveAuth(client,heartbeat){
 let previous='';
 for(;;){
  await heartbeat();const list=await client.auth.admin.listUsers({page:1,perPage:100});
  if(list.error)throw Error('AUTH_LIST_FAILED');if(!list.data.users.length)break;
  const fingerprint=JSON.stringify(list.data.users.map(user=>user.id));
  if(fingerprint===previous)throw Error('AUTH_REMOVE_STALLED');previous=fingerprint;
  for(const user of list.data.users){await heartbeat();const removed=await client.auth.admin.deleteUser(user.id);if(removed.error)throw Error('AUTH_REMOVE_FAILED');}
 }
}
export async function executeWipe({client,call,projectRef,publicKey,enabled,mailReady,log=()=>{}}){
 if(enabled!==true)throw Error('WORKER_DISABLED');
 if(!mailReady)throw Error('NOTIFICATION_NOT_READY');
 const inspect=await call('inspect',{mailReady:true});
 if(!inspect.enabled)throw Error('WORKER_DISABLED');
 if(inspect.backupPublicKey!==publicKey)throw Error('BACKUP_KEY_MISMATCH');
 // Verify before claiming or freezing the system. Auth-phase resumption validates
 // the original signed pre-wipe receipt even if it has since become old.
 verifyBackupReceipt(inspect.backup,publicKey,projectRef,{allowOld:inspect.phase==='auth'});
 const job=await call('claim');if(!job)return {processed:false};
 const backup=verifyBackupReceipt(job.backup,publicKey,projectRef,{allowOld:job.phase==='auth'});
 let last=0;
 async function heartbeat(){if(Date.now()-last>30000){await call('heartbeat',{id:job.id,lease:job.lease});last=Date.now();}}
 const data={id:job.id,lease:job.lease,backupDigest:backup.digest};
 if(job.phase==='files'){
  await removeLiveStorage(client,heartbeat);await call('files_done',data);job.phase='database';log('Live files removed.');
 }
 if(job.phase==='database'){
  await heartbeat();await call('wipe_database',data);job.phase='auth';log('Live application tables cleared.');
 }
 if(job.phase==='auth'){
  await removeLiveAuth(client,heartbeat);await call('complete',data);log('Live wipe completed.');
 }
 return {processed:true,id:job.id};
}
