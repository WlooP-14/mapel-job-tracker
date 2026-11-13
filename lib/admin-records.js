export const canManageData=role=>['admin','developer'].includes(role);
const f=(key,label,type='text',extra={})=>({key,label,type,...extra});
export const adminEntities={
 jobs:{job:true,fields:[f('mould_code','workflow.mouldCode'),f('name','workflow.mouldName'),f('customer_id','workflow.customer','customer'),f('trial_date_t0','workflow.trialDate','date'),f('priority','workflow.priority','priority')]},
 bom_items:{job:true,fields:[f('name','bom.name'),f('category','workflow.section','category'),f('material','bom.material'),f('qty_required','workflow.quantity','number'),f('finish_size_text','bom.finish'),f('rough_size_text','bom.rough'),f('size_text','bom.size'),f('remark','bom.remark','long'),f('notes','planning.note','long'),f('drawing_ref','admin.drawing'),f('two_d_submitted','workflow.twoD','boolean')]},
 bom_sheets:{job:true,fields:[f('title','admin.fileName'),...['prepared_by','review_by','checked_by','order_by','received_by','sheet_date'].map(key=>f(key,'bom.'+key))]},
 dispatch_batches:{job:true,fields:[f('label','planning.label'),f('notes','planning.note','long')]},
 part_steps:{job:true,fields:[f('vendor_id','planning.vendor','vendor'),f('duration_days','admin.duration','number'),f('buffer_days','planning.buffer','number'),f('target_date','planning.due','date'),f('planned_sent_on','admin.plannedStart','date'),f('started_on','planning.startedOn','date')]},
 receiving_checks:{job:true,fields:[f('qty_found','receiving.qty','number'),f('received_on','receiving.day','date'),f('request_note','planning.note','long'),f('result','admin.receiptResult','receiptResult')]},
 stage_returns:{job:true,fields:[f('qty','planning.quantity','number'),f('reported_on','planning.actualDate','date'),f('notes','planning.note','long')]},
 mould_events:{job:true,fields:[f('actual_on','trials.date','date'),f('trial_result','trials.result','trialResult'),f('notes','trials.note','long')]},
 remarks:{job:true,fields:[f('text','planning.remark','long')]},
 vendors:{fields:[f('name','shell.fullName'),f('contact','shell.contact'),f('type','shell.vendorType')]},
 customers:{fields:[f('name','workflow.customerName'),f('code','admin.customerCode')]},
 holidays:{fields:[f('date','shell.holidayDate','date'),f('note','shell.holidayNote')]},
 step_templates:{fields:[f('default_days','admin.duration','number'),f('order_no','processes.order','number'),f('default_selected','processes.selected','boolean'),f('active','shell.active','boolean')]},
 material_routes:{fields:[f('material','workflow.material'),f('step_name','planning.stage'),f('order_no','processes.order','number')]},
 users:{fields:[f('name','teamAuth.fullName'),f('role','shell.role','role'),f('active','shell.active','boolean')]},
 settings:{fields:[f('value','admin.value','setting')]}
};

export function changedAdminFields(entity,record,form){
 const changes={};
 for(const field of adminEntities[entity].fields){
  if(!(field.key in form))continue;
  const value=form[field.key];
  if(JSON.stringify(value??null)!==JSON.stringify(record[field.key]??null))changes[field.key]=value;
 }
 return changes;
}
