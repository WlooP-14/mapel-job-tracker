import {randomUUID} from 'node:crypto';

export default {
 reactStrictMode: true,
 ...(process.env.MJT_BUILD_DIR ? {distDir:process.env.MJT_BUILD_DIR} : {}),
 env: { MJT_RELEASE_VERSION: process.env.VERCEL_DEPLOYMENT_ID || randomUUID() },
 ...(process.env.DOCKER_BUILD === '1' ? { output: 'standalone' } : {})
};
