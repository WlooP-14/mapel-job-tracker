export const dynamic='force-dynamic';

export function GET(){
 return Response.json({version:process.env.MJT_RELEASE_VERSION},{headers:{'Cache-Control':'no-store'}});
}
