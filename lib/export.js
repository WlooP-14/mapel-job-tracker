export async function fetchAll(client,table,columns='*'){
 const rows=[];for(let offset=0;;offset+=500){const r=await client.from(table).select(columns).range(offset,offset+499);if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<500)break;}return rows;
}
export async function databaseWorkbook(client){
 const tables=['customers','jobs','job_date_history','bom_sheets','bom_revisions','bom_items','step_templates','material_routes','dispatch_batches','batch_items','part_steps','vendors','receiving_checks','stage_returns','mould_events','movements','remarks','holidays','settings','users','user_prefs','developer_credentials','kill_requests','audit_log'];
 const sheets=[];for(let offset=0;offset<tables.length;offset+=4){const batch=await Promise.all(tables.slice(offset,offset+4).map(async table=>{const rows=await fetchAll(client,table);const keys=[...new Set(rows.flatMap(row=>Object.keys(row)))];return {sheet:table.slice(0,31),data:keys.length?[keys,...rows.map(row=>keys.map(key=>{const value=row[key];return value==null?'':typeof value==='object'?JSON.stringify(value):value;}))]:[]};}));sheets.push(...batch);}
 return sheets;
}
export async function exportDatabase(client){
 const sheets=await databaseWorkbook(client);
 const {default:writeExcel}=await import('write-excel-file/browser');const blob=await writeExcel(sheets).toBlob();downloadBlob(blob,`mould-data-${new Date().toISOString().slice(0,10)}.xlsx`);
}
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
