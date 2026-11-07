export function canAssignRole(actor,role){return actor==='developer'?['admin','operator','viewer'].includes(role):actor==='admin'&&['operator','viewer'].includes(role);}
export function canManageProfile(actor,target){return ['admin','developer'].includes(actor)&&target!=='developer'&&(actor==='developer'||['operator','viewer'].includes(target));}
export function canUpdateRole(actor,target,role){return canManageProfile(actor,target)&&['admin','operator','viewer'].includes(role);}
