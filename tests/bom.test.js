import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSize,sizeWarnings} from '../lib/bom.js';
test('size parsing keeps shape and numeric dimensions separate from source text',()=>{
 assert.deepEqual(parseSize('ϕ44x233'),{shape:'round',diameter:44,length:233});
 assert.deepEqual(parseSize('66×55×50 mm'),{shape:'block',length:66,width:55,height:50});
 assert.equal(parseSize('check drawing'),null);
});
test('size warnings flag small rough stock and mixed shapes without blocking a row',()=>{
 assert.ok(sizeWarnings('66x55x50','65x56x52').includes('roughSmall'));
 assert.ok(sizeWarnings('ϕ44x233','44x44x233').includes('shapeMismatch'));
 assert.deepEqual(sizeWarnings('ϕ44x233','ϕ48x240'),[]);
});
