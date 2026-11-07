import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signInWithPin} from '../lib/pin-auth.js';
test('PIN sign-in uses password auth without sending SMS',async()=>{
 let credentials;const client={auth:{signInWithPassword:async value=>{credentials=value;return {error:null};}}};
 assert.deepEqual(await signInWithPin(client,'+919999999999','1234567890'),{error:null});assert.deepEqual(credentials,{phone:'+919999999999',password:'1234567890'});
});
test('invalid PIN or mobile number never calls Auth',async()=>{
 const client={auth:{signInWithPassword:()=>assert.fail('Invalid input reached Auth')}};
 for(const [phone,pin]of [['+919999999999','1234'],['9999999999','1234567890'],['+919999999999','abcdefgh']])assert.ok((await signInWithPin(client,phone,pin)).error);
});
