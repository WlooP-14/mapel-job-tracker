import {randomUUID} from 'node:crypto';

export default {
 reactStrictMode: true,
 outputFileTracingIncludes:{'/api/developer':['./supabase/migrations/20261113090000_developer_security.sql','./supabase/register_manual_developer_security.sql']},
 ...(process.env.MJT_BUILD_DIR ? {distDir:process.env.MJT_BUILD_DIR} : {}),
 env: { MJT_RELEASE_VERSION: process.env.VERCEL_DEPLOYMENT_ID || randomUUID() },
 ...(process.env.DOCKER_BUILD === '1' ? { output: 'standalone' } : {})
};
