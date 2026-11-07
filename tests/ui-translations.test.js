import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {messages} from '../locales/messages.js';
test('visible component translation references have defined labels in every language',async()=>{
 for(const file of (await readdir('components')).filter(f=>f.endsWith('.jsx'))){const source=await readFile('components/'+file,'utf8');const aliases=[['t',null],...Array.from(source.matchAll(/\b([a-z])=t\.(\w+)/g),match=>[match[1],match[2]])];for(const [alias,group]of aliases){for(const match of source.matchAll(new RegExp('\\b'+alias+'\\.([A-Za-z_]\\w*)','g'))){for(const lang of ['en','hi','mr'])assert.ok((group?messages[lang][group]:messages[lang])[match[1]]!==undefined,`${file}: ${lang}.${group?group+'.':''}${match[1]} is missing`);}}}
});
