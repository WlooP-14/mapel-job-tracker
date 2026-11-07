export function isValidPin(pin){return /^\d{8,12}$/.test(pin);}
export function isTeamPin(pin){return /^\d{6}$/.test(pin);}
// Keep six-digit entry compatible with the project's eight-character Auth minimum.
export function teamPinPassword(pin){return `mjt-pin:${pin}`;}
export function indiaPhone(value){return /^\d{10}$/.test(value)?`+91${value}`:'';}
export function indiaPhoneDigits(value){
 const digits=value.replace(/\D/g,'');
 return (digits.length===12&&digits.startsWith('91')?digits.slice(2):digits).slice(0,10);
}
export function isValidPhone(phone){return /^\+[1-9]\d{7,14}$/.test(phone.trim());}
export async function signInWithPin(client,phone,pin){
 if((!isTeamPin(pin)&&!isValidPin(pin))||!isValidPhone(phone))return {error:true};
 return client.auth.signInWithPassword({phone:phone.trim(),password:isTeamPin(pin)?teamPinPassword(pin):pin});
}

const preferenceKey='mjt-keep-signed-in';
export function keepSignedIn(value){window.sessionStorage.setItem(preferenceKey,value?'yes':'no');}
function activeStorage(){return window.sessionStorage.getItem(preferenceKey)==='no'?window.sessionStorage:window.localStorage;}
export const authStorage={
 getItem(key){return typeof window==='undefined'?null:activeStorage().getItem(key);},
 setItem(key,value){if(typeof window==='undefined')return;window.localStorage.removeItem(key);window.sessionStorage.removeItem(key);activeStorage().setItem(key,value);},
 removeItem(key){if(typeof window==='undefined')return;window.localStorage.removeItem(key);window.sessionStorage.removeItem(key);}
};
