export function isValidPin(pin){return /^\d{8,12}$/.test(pin);}
export function isValidPhone(phone){return /^\+[1-9]\d{7,14}$/.test(phone.trim());}
export async function signInWithPin(client,phone,pin){
 if(!isValidPin(pin)||!isValidPhone(phone))return {error:true};
 return client.auth.signInWithPassword({phone:phone.trim(),password:pin});
}
