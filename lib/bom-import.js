import {messages} from '../locales/messages.js';
const normal=value=>String(value??'').toUpperCase().replace(/[^\p{L}\p{M}\p{N}]/gu,'');
const text=value=>value==null?'':value instanceof Date?value.toISOString().slice(0,10):String(value).trim();
function section(value){const n=normal(value);if(n.includes('HARDWARE'))return 'hardware';if(n.includes('CHILDPART'))return 'child';if(n.includes('TURNPART'))return 'turn';if(n.includes('PLATESIZE')||n.includes('MOULDBASE')||n.includes('MOLDBASE'))return 'base';for(const t of Object.values(messages))for(let i=0;i<t.tabs.length;i++)if(n.includes(normal(t.tabs[i])))return ['base','child','turn','hardware'][i];return null;}
const signoffKeys={PREPAREDBY:'prepared_by',REVIEWBY:'review_by',CHECKEDBY:'checked_by',ORDERBY:'order_by',RECEIVEDBY:'received_by',DATE:'sheet_date'};
const headerKeys={};for(const t of Object.values(messages)){for(const [field,key]of Object.entries({serial:'NO',name:'NAME',finish:'FINISHSIZE',rough:'ROUGHSIZE',material:'MATERIAL',qty:'QTY',size:'SIZE',remark:'REMARK'}))headerKeys[normal(t.bom[field])]=key;for(const key of Object.values(signoffKeys))signoffKeys[normal(t.bom[key])]=key;}
export function parseBomWorkbook(sheets){
 const rows=[],signoff={};let code='';
 for(const sheet of sheets){let category=section(sheet.sheet),columns=null;
  for(const row of sheet.data){if(!Array.isArray(row))continue;const cells=row.map(text),norm=cells.map(v=>headerKeys[normal(v)]||normal(v));const title=cells.find(v=>section(v));if(title&&!norm.includes('NAME')){category=section(title);columns=null;}
   if(!code&&!columns){const match=cells.join(' ').match(/\b\d{4}[A-WY-Z]{2}[A-Z0-9_-]{2,53}\b/i);if(match)code=match[0].toUpperCase();}
   let signoffRow=false;for(let i=0;i<norm.length;i++){const key=signoffKeys[norm[i]];if(key){if(cells[i+1]||signoff[key]===undefined)signoff[key]=cells[i+1]||'';signoffRow=true;}}if(signoffRow){columns=null;continue;}
   if(norm.includes('NAME')&&(norm.includes('QTY')||norm.includes('QUANTITY'))){columns={};for(let i=0;i<norm.length;i++)columns[norm[i]]=i;if(!category&&norm.includes('SIZE')&&!norm.includes('FINISHSIZE'))category='hardware';continue;}
   if(!columns)continue;const get=(...names)=>{const key=names.find(n=>columns[n]!==undefined);return key===undefined?'':cells[columns[key]]||''};const name=get('NAME');if(!name)continue;
   const qty=get('QTY','QUANTITY'),number=Number(qty);rows.push({category:category||'child',name,material:get('MATERIAL','MAT'),qty_required:qty&&Number.isFinite(number)?number:'',finish_size_text:get('FINISHSIZE'),rough_size_text:get('ROUGHSIZE'),size_text:get('SIZE'),remark:get('REMARK','REMARKS'),two_d_submitted:false});
   if(rows.length>1000)throw Error('TOO_MANY_ROWS');
  }
 }
 if(!rows.length)throw Error('NO_ROWS');return {code,rows,signoff};
}
