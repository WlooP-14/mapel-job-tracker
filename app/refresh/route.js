// Development-only recovery for old service-worker caches. It never clears Auth storage.
import {messages} from '../../locales/messages';
export async function GET(request){
 if(!['127.0.0.1','localhost'].includes(new URL(request.url).hostname))return new Response(null,{status:404});
 const nonce=crypto.randomUUID();const script=`(async()=>{try{for(const r of await navigator.serviceWorker.getRegistrations()){if(r.active?.scriptURL.endsWith('/sw.js'))await r.unregister();}for(const k of await caches.keys()){if(k.startsWith('mould-shell-'))await caches.delete(k);}location.replace('/');}catch{document.getElementById('state').textContent=${JSON.stringify(messages.en.shell.networkError)};}})();`;
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${messages.en.app}</title><p id="state">${messages.en.loading}</p><script nonce="${nonce}">${script}</script></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'`}});
}
