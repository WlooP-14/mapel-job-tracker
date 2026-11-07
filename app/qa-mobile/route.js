import {messages} from '../../locales/messages';
export async function GET(request){
 if(process.env.NODE_ENV!=='development'||!['localhost','127.0.0.1'].includes(new URL(request.url).hostname))return new Response(null,{status:404});
 const mould=new URL(request.url).searchParams.get('mould'),src=/^[0-9a-f-]{36}$/i.test(mould||'')?'/?mould='+mould:'/';
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${messages.en.app}</title><body style="margin:0;background:white"><iframe title="${messages.en.app}" src="${src}" width="390" height="844" style="display:block;border:1px solid #d9d9d9;max-width:100%;background:white"></iframe></body></html>`,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; frame-src 'self'; style-src 'unsafe-inline'"}});
}
