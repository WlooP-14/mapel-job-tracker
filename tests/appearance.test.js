import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readAppearance,storeAppearance,resolvedAppearance,applyAppearance} from '../lib/appearance.js';

test('appearance isolates accounts, restores offline edits and accepts account preferences on other devices',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 storeAppearance(storage,'user-a','dark',true);
 assert.deepEqual(readAppearance(storage,'user-a','light'),{value:'dark',pending:true});
 assert.equal(readAppearance(storage,'user-b').value,'light');
 assert.equal(readAppearance(storage,null).value,'light');
 storeAppearance(storage,'user-a','dark',false);
 assert.equal(readAppearance(storage,'user-a','system').value,'system');
 assert.equal(readAppearance(storage,'new-device-user','dark').value,'dark');
 assert.equal(storeAppearance(storage,'user-a','untrusted'),false);
 assert.equal(readAppearance({getItem:()=>'{invalid'},'user-a').value,'light');
 assert.equal(readAppearance({getItem:()=>{throw Error('blocked')}},'user-a','dark').value,'dark');
});

test('system appearance resolves with the device while explicit preferences override it and update PWA chrome',()=>{
 assert.equal(resolvedAppearance('system',true),'dark');
 assert.equal(resolvedAppearance('system',false),'light');
 assert.equal(resolvedAppearance('light',true),'light');
 assert.equal(resolvedAppearance('dark',false),'dark');
 let meta;
 const document={documentElement:{dataset:{},style:{}},querySelector:()=>meta,createElement:()=>({}),head:{appendChild:value=>{meta=value}}};
 applyAppearance(document,'system',true);
 assert.equal(document.documentElement.dataset.theme,'dark');
 assert.equal(meta.content,'#111318');
 applyAppearance(document,'light',true);
 assert.equal(meta.content,'#ffffff');
});

test('both appearance palettes keep body, muted and accent text readable and the red main button has readable text',async()=>{
 const css=await readFile('styles/tokens.css','utf8');
 const parse=selector=>Object.fromEntries([...css.match(selector)[1].matchAll(/--([\w-]+):(#[0-9a-f]+)/g)].map(m=>[m[1],m[2]]));
 const light=parse(/:root\{([^}]+)\}/),dark={...light,...parse(/:root\[data-theme=dark\]\{([^}]+)\}/)};
 const luminance=hex=>{const full=hex.length===4?hex.slice(1).split('').map(c=>c+c).join(''):hex.slice(1);return [0,2,4].map(i=>parseInt(full.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);};
 const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 for(const palette of [light,dark])for(const text of ['ink','muted','accent'])assert.ok(contrast(palette[text],palette.surface)>=4.5,`${text} contrast`);
 assert.ok(contrast('#ffffff',light.red)>=4.5);
});
