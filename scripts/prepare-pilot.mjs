import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const stage = join(root, '.pilot-deploy');
const env = parseEnv(await readFile(join(root, '.env.local'), 'utf8'));
const keyName = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' : 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env[keyName];
if (!url || new URL(url).protocol !== 'https:' || !key || !/^[A-Za-z0-9._-]+$/.test(key) || key.startsWith('sb_secret_')) {
 throw new Error('Set the Supabase HTTPS URL and public key in .env.local before preparing the pilot.');
}
if (keyName === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
 const claims = JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString());
 if (claims.role !== 'anon') throw new Error('The legacy Supabase key must have the anon role.');
} else if (!key.startsWith('sb_publishable_')) {
 throw new Error('Use a Supabase publishable key or the legacy anon variable.');
}

await mkdir(stage, { recursive: true });
const entries = ['app', 'components', 'lib', 'locales', 'public', 'styles', 'next.config.mjs', 'postcss.config.mjs', 'package.json', 'package-lock.json', 'netlify.toml'];
await Promise.all(entries.map(entry => cp(join(root, entry), join(stage, entry), { recursive: true })));
await writeFile(join(stage, '.env.local'), `NEXT_PUBLIC_SUPABASE_URL=${new URL(url).origin}\n${keyName}=${key}\n`);
console.log(`Pilot files prepared in ${stage}`);
