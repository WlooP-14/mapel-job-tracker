import {readFile} from 'node:fs/promises';
import path from 'node:path';

// Fixed files only; no caller-supplied paths or credentials enter this download.
export async function developerSetupSql(){
 const [migration,history]=await Promise.all([
  readFile(path.join(process.cwd(),'supabase/migrations/20261113090000_developer_security.sql'),'utf8'),
  readFile(path.join(process.cwd(),'supabase/register_manual_developer_security.sql'),'utf8')
 ]);
 return '-- Apply ONCE to the existing Mould Job Tracker project in Supabase SQL Editor.\n-- Installs security setup and records migration history. Wiping remains disabled.\nbegin;\n'+migration+'\n'+history.replace(/^begin;\r?$/m,'').replace(/^commit;\r?$/m,'')+'\ncommit;\n';
}
