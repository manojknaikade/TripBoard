import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
    ...nextVitals,
    ...nextTs,
    globalIgnores([
        '.next/**',
        'out/**',
        'build/**',
        'coverage/**',
        'next-env.d.ts',
        'docs/research/**',
        'output/**',
        'scripts/**',
        'tmp/**',
        'tmp_query.js',
        'src/app/api/tesla/telemetry-config/route.ts.bak',
    ]),
]);
