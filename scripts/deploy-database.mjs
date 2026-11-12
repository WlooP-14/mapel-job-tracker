import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const projectRef='emrjfelkxbegkvyxszba';

export function databaseTarget(value){
 let url;
 try{url=new URL(value);}catch{throw Error('Set SUPABASE_DB_URL to the project Session pooler connection string.');}
 const direct=url.hostname===`db.${projectRef}.supabase.co`&&url.username==='postgres';
 const pooler=/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)&&url.username===`postgres.${projectRef}`;
 if(!['postgres:','postgresql:'].includes(url.protocol)||(!direct&&!pooler)||url.port!=='5432'||url.pathname!=='/postgres'||!url.password||url.hash){
  throw Error('Use the existing Mapel project database, port 5432 and database postgres. No database changes were made.');
 }
 url.searchParams.set('sslmode','require');
 return url;
}

export function deployDatabase({value=process.env.SUPABASE_DB_URL,apply=false,run=execFileSync,log=console.log}={}){
 const url=databaseTarget(value);
 const cli=fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js',import.meta.url));
 const args=[cli,'db','push',`--remote=${url.href}`,'--skip-vault',...(apply?['--yes']:['--dry-run'])];
 // Never invoke a shell or forward CLI diagnostics, which may contain connection credentials.
 try{run(process.execPath,args,{stdio:['ignore','pipe','pipe'],timeout:180000,maxBuffer:4*1024*1024});}
 catch{throw Error('Database deployment failed. Check the saved connection, project availability and migration history. Credentials and CLI diagnostics were withheld. No automatic repair or reset was attempted.');}
 log(apply?'Database migrations applied successfully.':'Database migration preview passed. Run with --apply to deploy pending migrations.');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{deployDatabase({apply:process.argv.includes('--apply')});}
 catch(error){console.error(error.message);process.exitCode=1;}
}
