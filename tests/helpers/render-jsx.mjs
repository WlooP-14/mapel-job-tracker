import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {transform,loadBindings} from 'next/dist/build/swc/index.js';

// Use the installed Next compiler to render actual JSX in Node tests, including imports.
export async function componentModule(file){
 await loadBindings();
 const cache=new Map();
 async function compile(filename){
  if(cache.has(filename))return cache.get(filename);
  const source=await readFile(filename,'utf8');
  const output=await transform(source,{filename,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'es6'}});
  let code=output.code;
  for(const match of [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)]){
   const specifier=match[1];let target;
   if(specifier.startsWith('.')){
    const base=path.resolve(path.dirname(filename),specifier);
    let resolved;
    for(const candidate of [base,base+'.js',base+'.jsx']){try{await access(candidate);resolved=candidate;break;}catch{}}
    if(!resolved)throw Error('Component dependency missing: '+specifier);
    target=await compile(resolved);
   }else target=import.meta.resolve(specifier);
   code=code.replaceAll(match[0],`from ${JSON.stringify(target)}`);
  }
  const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');
  cache.set(filename,url);return url;
 }
 return import(await compile(path.resolve(file)));
}
