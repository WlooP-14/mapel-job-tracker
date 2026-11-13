// Preparation only. This writes ignored local configuration; it never activates or runs a wipe.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicKey,randomBytes,createHash} from 'node:crypto';
const publicFile=process.argv[2];if(!publicFile)throw Error('Provide the backup process public Ed25519 key file. Keep its private key outside this project and the worker host.');
const key=createPublicKey(await readFile(publicFile,'utf8'));if(key.asymmetricKeyType!=='ed25519')throw Error('Ed25519 public key required.');
const pem=key.export({type:'spki',format:'pem'}).toString(),secret=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(secret).digest('hex');
await mkdir('infra',{recursive:true});
await writeFile('infra/backup-verification.local.pem',pem,{flag:'wx'});
const ref='emrjfelkxbegkvyxszba';
await writeFile('.env.kill-worker.local',`SUPABASE_URL=https://${ref}.supabase.co\nKILL_EXPECTED_PROJECT_REF=${ref}\nSUPABASE_SERVICE_ROLE_KEY=\nKILL_WORKER_SECRET=${secret}\nKILL_WORKER_ENABLED=false\nBACKUP_PUBLIC_KEY_FILE=infra/backup-verification.local.pem\nSMTP_HOST=\nSMTP_PORT=587\nSMTP_USER=\nSMTP_PASSWORD=\nDEVELOPER_NOTICE_FROM=\nDEVELOPER_NOTICE_TO=\n`,{flag:'wx',mode:0o600});
await writeFile('infra/kill-activation.local.sql',`-- Configure only. Wipe remains disabled. Never put the worker secret in the web app.\nupdate app_private.developer_control set worker_key_hash='${hash}',backup_public_key='${pem.replaceAll("'","''")}',wipe_enabled=false where singleton;\n-- Enable only AFTER the backup, restore drill, email test and isolated wipe drill:\n-- update app_private.developer_control set wipe_enabled=true where singleton;\n`,{flag:'wx',mode:0o600});
console.log('Prepared ignored worker configuration and SQL. Wiping remains disabled. No secrets were displayed.');
