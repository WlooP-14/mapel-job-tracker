import {test} from 'node:test';
import assert from 'node:assert/strict';
import {databaseTarget,deployDatabase} from '../scripts/deploy-database.mjs';

const connection='postgresql://postgres.emrjfelkxbegkvyxszba:test%24pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';

test('database deployments restrict the destination to the existing project and require TLS',()=>{
 assert.equal(databaseTarget(connection).searchParams.get('sslmode'),'require');
 for(const value of [undefined,connection.replace('emrjfelkxbegkvyxszba','anotherproject'),connection.replace(':5432',':6543'),connection.replace('/postgres','/other'),connection.replace('pooler.supabase.com','evil.example')]){
  assert.throws(()=>databaseTarget(value));
 }
});

test('database preview is the default and apply never resets, repairs or seeds',()=>{
 for(const apply of [false,true]){
  let captured;
  deployDatabase({value:connection,apply,run:(...args)=>{captured=args;return '';},log:()=>{}});
  const [,args,options]=captured;
  assert.equal(options.shell,undefined);
  assert.deepEqual(args.slice(1,3),['db','push']);
  assert.equal(args.includes('--dry-run'),!apply);
  assert.equal(args.includes('--yes'),apply);
  assert.ok(args.includes('--skip-vault'));
  assert.ok(!args.some(arg=>['--include-all','--include-seed','--include-roles','reset','repair'].includes(arg)));
 }
});

test('database command failures never expose connection credentials or raw diagnostics',()=>{
 const messages=[];
 assert.throws(()=>deployDatabase({value:connection,run:()=>{throw Error(connection);},log:m=>messages.push(m)}),error=>{
  assert.ok(!error.message.includes('test%24pass'));
  assert.ok(!error.message.includes('postgresql://'));
  return true;
 });
 assert.deepEqual(messages,[]);
});
