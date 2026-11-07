import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractBom} from '../lib/extract-bom.js';
test('BOM extraction switches adapters without changing the caller', async () => {
 const adapters = {gemini: async image => ({source:'gemini',image}), alternate: async image => ({source:'alternate',image})};
 assert.deepEqual(await extractBom('photo',{provider:'alternate',adapters}),{source:'alternate',image:'photo'});
 await assert.rejects(extractBom('photo',{provider:'missing',adapters}),/not configured/);
});
