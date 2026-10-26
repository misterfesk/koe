# Koe private review app

All F01–F16 are available using synthetic session data. No live AI, messaging, backend, analytics, browser persistence or real notifications. Reloading starts a fresh session; internal navigation keeps drafts. Do not enter personal health data.

## Run locally

Requires Node 24 (checked with 24.16.0) and npm (checked with 11.13.0). From this worktree:

```powershell
cd <local path>
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run start
```

Open http://127.0.0.1:3100/review for the feature index, or `/` for the introduction. `start` uses the production build from `check`; `dev` runs development on the same local-only port. Stop with Ctrl+C. No deployment is configured or authorized.

## Commands and versions

`check` = read-only formatting check, ESLint (zero warnings), strict TypeScript, Vitest and Next production build. `test:e2e` starts/stops its own production server at 3200 (`PW_PORT` overrides), with 1440px desktop and 390px mobile Chromium projects. The suite includes all five keyboard journeys, axe on all routes, 320px/200% text, draft recovery, exports, deletion, storage and network checks. Every browser spec uses the shared outside-request/page/console-error guard; expected document 404s alone are exempted.

`npm.cmd run tour` explicitly regenerates `docs/tour/*.png` from populated synthetic journeys at both sizes. It starts/stops a separate production server at 3400. Ordinary check/test commands never rewrite the screenshot tour. `npm.cmd run format` explicitly formats source.

Pinned stack: Next 16.4.3, React/React DOM 19.3.1, TypeScript 6.0.3, Zod 4.6.7, Vitest 5.0.5, Playwright 1.64.1, axe Playwright 4.14.0, ESLint 9.39.5, Prettier 3.9.10. Full pins are in package-lock.json. Self-hosted Sora, Space Grotesk and IBM Plex Sans retain their licenses in public/fonts.

## Review scenarios

First visit; returning after absence; low energy; empty history; sparse history; declined suggestion; provider offline; revoked consent; no safe contact; coaching paused. Switching/resetting a scenario deliberately clears synthetic session state; use Your data to export first. Review tooling and error previews are isolated by `NEXT_PUBLIC_REVIEW_TOOLS=false` at build time. This flag is not authentication.

## Limits and open choices

Scripted conversation uses fixed responses and does not assess the text. Suggestions are fixtures; memory-based drafts use approved card wording, and smaller versions are editable. Reminder previews run on a virtual clock. Care documents preserve the original notes beside a user-written summary; there is no generated clinical summary or appointment integration. Help resources were independently checked on 2026-10-25, with primary-source provenance in `docs/help-resources-sources.md`; these checks do not verify service availability or connection.

This is a private product review build, not clinical/legal approval or real-user release readiness. Browser automation is Chromium-only; no physical phone, screen-reader, Safari or Firefox verification is claimed. Product direction, final visuals and feature cuts remain owner decisions. See ../REVIEW-HANDOFF.md for final validation and review questions.
