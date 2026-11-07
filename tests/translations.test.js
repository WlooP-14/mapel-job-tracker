import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messages} from '../locales/messages.js';
function paths(value,prefix=''){return Object.entries(value).flatMap(([key,item])=> typeof item==='object'&&!Array.isArray(item)?paths(item,prefix+key+'.'):[prefix+key]).sort();}
test('all languages have matching translation keys and tour/status lengths',()=>{
 for(const lang of ['hi','mr']){
  assert.deepEqual(paths(messages[lang]),paths(messages.en));
  assert.equal(messages[lang].statuses.length,5);
  assert.equal(messages[lang].steps.length,messages.en.steps.length);
 }
});
