import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseBomWorkbook} from '../lib/bom-import.js';
import {bomWorkbook} from '../lib/bom-export.js';
import {messages} from '../locales/messages.js';
test('Excel BOM import preserves section order, original dimensions and hardware columns',()=>{
 const result=parseBomWorkbook([{sheet:'PLATE SIZE',data:[['1420BAEM0926 N50 LID MOLD PLATE SIZE'],['SR NO.','NAME','FINISH SIZE','ROUGH SIZE','MATERIAL','QTY'],[1,'TOP PLT','100x80x20','105x85x25','C-45',2],['Prepared By','Harsh']]},{sheet:'Parts',data:[['TURN PART'],['No','NAME','FINISH SIZE','ROUGH SIZE','MATERIAL','QTY'],[1,'Pin','ϕ44x233','ϕ48x240','8620',4],['HARDWARE'],['No','NAME','SIZE','QTY','REMARK'],[1,'Bolt','M12x80',6,'CORE PLT']]}]);
 assert.equal(result.code,'1420BAEM0926');assert.deepEqual(result.rows.map(r=>r.category),['base','turn','hardware']);assert.equal(result.rows[1].finish_size_text,'ϕ44x233');assert.equal(result.rows[2].remark,'CORE PLT');assert.equal(result.rows[2].qty_required,6);assert.equal(result.signoff.prepared_by,'Harsh');
});
test('exported section layouts round-trip in English, Hindi and Marathi',()=>{
 const job={mould_code:'1420BAEM0926',name:'Test mould'},parts=[{category:'base',name:'Plate',finish_size_text:'100x80x20',rough_size_text:'105x85x25',material:'C-45',qty_required:2},{category:'hardware',name:'Bolt',size_text:'M12x80',qty_required:6,remark:'CORE PLT'}];
 for(const t of Object.values(messages)){const r=parseBomWorkbook(bomWorkbook(job,parts,[{section:'base',prepared_by:'Test'}],t));assert.equal(r.rows.length,2);assert.deepEqual(r.rows.map(p=>p.category),['base','hardware']);assert.equal(r.rows[1].remark,'CORE PLT');assert.equal(r.signoff.prepared_by,'Test');}
});
test('unrecognized sheet columns fail explicitly and missing quantities remain reviewable',()=>{
 assert.throws(()=>parseBomWorkbook([{sheet:'Other',data:[['Hello','world']]}]),/NO_ROWS/);
 const r=parseBomWorkbook([{sheet:'Child Parts',data:[['No','NAME','FINISH SIZE','ROUGH SIZE','MATERIAL','QTY'],[1,'Insert','10x20x30',null,'P-20',null]]}]);assert.equal(r.rows[0].qty_required,'');assert.equal(r.rows[0].category,'child');
});
