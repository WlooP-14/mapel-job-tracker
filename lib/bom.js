export const CATEGORIES=['base','child','turn','hardware'];
export function parseSize(text){
 if(!text?.trim())return null;
 const source=text.trim().toLowerCase().replace(/mm\s*$/,'').replace(/\s+/g,'');
 const round=/^(?:ϕ|φ|ø|⌀|dia)/i.test(source);
 const parts=source.replace(/^(?:ϕ|φ|ø|⌀|dia)/i,'').split(/[x×*]/).map(Number);
 if(parts.some(n=>!Number.isFinite(n)||n<=0))return null;
 if(round&&parts.length===2)return {shape:'round',diameter:parts[0],length:parts[1]};
 if(!round&&parts.length===3)return {shape:'block',length:parts[0],width:parts[1],height:parts[2]};
 return null;
}
export function sizeWarnings(finish,rough){
 const a=parseSize(finish),b=parseSize(rough);const warnings=[];
 if(!finish?.trim()||!rough?.trim())warnings.push('missingSize');
 if(finish?.trim()&&!a||rough?.trim()&&!b)warnings.push('unreadSize');
 if(a&&b){if(a.shape!==b.shape)warnings.push('shapeMismatch');else if(Object.keys(a).some(k=>k!=='shape'&&b[k]<a[k]))warnings.push('roughSmall');}
 return warnings;
}
