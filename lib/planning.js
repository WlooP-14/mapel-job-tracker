import {addWorkingDays} from './scheduling.js';
export function shiftWorkingDays(start,days,holidays=[]){
 if(days>=0)return addWorkingDays(start,days,holidays);
 const day=new Date(start+'T12:00:00Z'),off=new Set(holidays);let left=-days;
 while(left){day.setUTCDate(day.getUTCDate()-1);if(day.getUTCDay()!==0&&!off.has(day.toISOString().slice(0,10)))left--;}
 return day.toISOString().slice(0,10);
}
export function planningDates({trialDate,sentOn,stages,buffer,lead,holidays}){
 if(!trialDate||!stages.length||stages.some(s=>s.default_days==null))return [];
 let due;
 return stages.map((s,index)=>{due=index?shiftWorkingDays(due,Number(s.default_days)+buffer,holidays):sentOn?shiftWorkingDays(sentOn,Number(s.default_days),holidays):shiftWorkingDays(trialDate,-lead,holidays);return {...s,target_date:due}});
}
export function planningBlock(part,reallot){
 if(!part.material?.trim())return 'missingMaterial';
 if(!part.part_steps.some(s=>s.step_name==='Received'&&s.status==='DONE'))return 'receiveFirst';
 const work=part.part_steps.filter(s=>s.step_name!=='Received');
 if(work.some(s=>s.started_on||Number(s.qty_completed)>0||['IN PROCESS','DONE'].includes(s.status)))return 'started';
 if(!reallot&&work.some(s=>s.batch_id))return 'already';
 return null;
}
export async function paged(query){const rows=[];for(let from=0;;from+=500){const r=await query().range(from,from+499);if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<500)return rows;}}
