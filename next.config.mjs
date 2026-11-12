import {randomUUID} from 'node:crypto';

export default {
 reactStrictMode: true,
 env: { MJT_RELEASE_VERSION: process.env.VERCEL_DEPLOYMENT_ID || randomUUID() },
 ...(process.env.DOCKER_BUILD === '1' ? { output: 'standalone' } : {})
};
