# Koe private review app

Synthetic-data only. Session state lives in React memory and disappears on reload. No live AI, messaging, backend, browser data storage or real notifications.

Node 24.16.0, npm 11.13.0. Next 16.4.3, React/React DOM 19.3.1, TypeScript 6.0.3, Zod 4.6.7, Vitest 5.0.5, Playwright 1.64.1. All dependency versions are pinned in package-lock.json.

From web/: npm ci; npm run check; npm run test:e2e. PowerShell with restricted script policy can use npm.cmd and npx.cmd. npm run dev binds 127.0.0.1:3100. npm run start runs production there. Playwright starts/stops its own production server on 3200; run npm run build first. Install browser once with npx playwright install chromium.

Review tooling is isolated by NEXT_PUBLIC_REVIEW_TOOLS=false at build time. This is not an authentication system. No deployment is authorized.

S0 checks: 12 domain/tone tests, lint/typecheck/build, 2 shell browser checks (1440 and 390) including axe and 404. Remaining feature routes are subsequent slices.
