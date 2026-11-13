// Run beside the independent backup process only after export and restore checks.
// The private signing key never belongs in the app or wipe worker environment.
import {readFile,writeFile} from 'node:fs/promises';
import {createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {canonical,hash,verifyBackupReceipt} from '../lib/developer-security.js';
const [payloadFile,keyFile,backupFile,outputFile]=process.argv.slice(2);
if(!payloadFile||!keyFile||!backupFile||!outputFile)throw Error('Usage: node scripts/sign-backup-receipt.mjs payload.json private-key.pem encrypted-backup-file receipt.json');
const payload=JSON.parse(await readFile(payloadFile,'utf8')),key=createPrivateKey(await readFile(keyFile,'utf8'));
if(key.asymmetricKeyType!=='ed25519')throw Error('An Ed25519 backup signing key is required.');
const digest=createHash('sha256');for await(const chunk of createReadStream(backupFile))digest.update(chunk);payload.snapshotSha256=digest.digest('hex');
const signature=sign(null,Buffer.from(canonical(payload)),key).toString('base64url');
verifyBackupReceipt({payload,signature},createPublicKey(key),payload.projectRef);
await writeFile(outputFile,JSON.stringify({payload,signature,digest:hash(canonical(payload)+'.'+signature)},null,2)+'\n',{flag:'wx'});
console.log('Signed receipt written. Signing key was not displayed.');
