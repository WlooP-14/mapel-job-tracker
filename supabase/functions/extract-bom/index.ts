// Deploy with GEMINI_API_KEY and BOM_GEMINI_MODEL set as Edge Function secrets.
// This returns untrusted draft JSON only; it never writes BOM rows.
import {extractBom} from '../_shared/extract-bom.js';
import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: identity, error: identityError } = await supabase.auth.getUser();
    if (identityError || !identity.user) return new Response('Unauthorized', { status: 401, headers: cors });
    const { data: user } = await supabase.from('users').select('role,active,archived_at').eq('id', identity.user.id).maybeSingle();
    if (!user?.active || user.archived_at || !['developer','admin','operator'].includes(user.role)) return new Response('Forbidden', { status: 403, headers: cors });
    const { data: setting } = await supabase.from('settings').select('value').eq('key','bom_extraction_provider').is('archived_at', null).single();
    const { image, mimeType } = await req.json();
    if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(mimeType) || typeof image !== 'string' || image.length > 12_000_000 || !/^[A-Za-z0-9+/=]+$/.test(image)) return new Response('Invalid file', {status:400,headers:cors});
    const providers: Record<string, (image: string, mimeType: string) => Promise<unknown>> = {
      gemini: async (data, type) => {
        const key = Deno.env.get('GEMINI_API_KEY'); const model = Deno.env.get('BOM_GEMINI_MODEL');
        if (!key || !model || !/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Provider not configured');
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method:'POST', headers:{'content-type':'application/json','x-goog-api-key':key}, body:JSON.stringify({contents:[{parts:[{text:'Read this mould BOM as JSON. Preserve section order and original text. Sections: Mould Base, Child Part, Turn Part, Hardware. Columns: No, NAME, FINISH SIZE, ROUGH SIZE, MATERIAL, QTY; hardware: No, NAME, SIZE, QTY, REMARK. Include mould code, name, sign-off fields and uncertain cells. Do not invent values.'},{inline_data:{mime_type:type,data}}]}],generationConfig:{responseMimeType:'application/json'}}) });
        if (!response.ok) throw new Error('Provider request failed');
        const result = await response.json(); return JSON.parse(result.candidates[0].content.parts[0].text);
      }
    };
    const draft = await extractBom(image, {provider:String(setting?.value), adapters: Object.fromEntries(Object.entries(providers).map(([key,adapter])=>[key,(data: string)=>adapter(data,mimeType)]))});
    return Response.json({ draft }, { headers: cors });
  } catch { return new Response('Extraction failed', {status:500,headers:cors}); }
});
