# Koe

Koe is an AI companion web app for adults living with depression. It helps plan a small, realistic day, adjusts that day when energy drops, finds a few trustworthy things to read or watch, and is there to talk. It supports human care and does not replace it.

**Live demo:**  https://koe-6jwd.onrender.com/

Early public preview. Koe is not a medical device and is not for emergencies. If you are in danger, contact local emergency services or a crisis line. The app's Help page lists verified lines by region.

<!-- screenshots -->

## What it does

- **Today.** A short chat intake, then a plan of three to five small entries built from a fixed menu of activity types. A daily energy check-in can make the day lighter. "Not today" swaps or shrinks an entry. Reminders are optional and use web push.
- **Talk.** A chat that knows your plan and the notes you chose to keep. It can propose a change to your day, a reminder, a memory, a message draft, or a search. Nothing changes until you confirm it.
- **Shelf.** A few picks matched to what you are working on: articles, guides, communities and videos from listed channels. Each pick says why it is there. Save it or mark it "Not for me".
- **You and Appointment lookup.** What Koe knows about you, editable. Notes you can edit or delete. One tap on Look up finds regional services, meetups, classes and therapy directories.
- **Help.** One tap from every screen, no sign-in. Verified, region-specific crisis lines with the date they were last checked.

The app works without AI. With `KOE_AI=off`, plans, check-ins, reminders and Help use fixed rules and copy.

## How it uses NVIDIA Nemotron on Nebius Token Factory

All model calls go through Nebius Token Factory to open NVIDIA Nemotron models. Model IDs are configuration (`KOE_CHAT_MODEL`, `KOE_FAST_MODEL`, `KOE_SAFETY_MODEL`, `KOE_FALLBACK_MODEL`).

| Role | Model | Used for |
|---|---|---|
| Chat | `nvidia/Nemotron-3-Ultra-550b-a55b` | Talk replies, intake summary, the weekly-things interview, planning a whole day |
| Fast and safety | `nvidia/Nemotron-3_5-Lightning` | Safety classification on every Talk turn, Shelf search intents, resource screening, appointment lookup, week topics, swapping or shrinking one entry, short summaries |
| Fallback | `nvidia/Nemotron-3_5-Lightning` | One retry when the primary call fails on a network error, timeout, 5xx or 429 |

Where Token Factory helped:

- **One API for three model sizes.** The big model handles judgement and conversation. The small one handles narrow, frequent jobs cheaply and quickly. Switching is a config change.
- **Structured output.** Plans, interview turns and search intents use strict JSON schema output, checked again with zod. Talk uses OpenAI-style tool calls, and invalid or unknown calls are dropped.
- **Fast screening.** The 30B-A3B model checks each search result and classifies risk without slowing the app down.
- **Fallback.** A larger sibling model covers outages and rate limits within the same time budget.

Every call is logged with its purpose, model, tokens, latency and cost, never the text. `npm run ai:usage` prints the totals.

## How it uses Tavily

Tavily powers two features.

- **Shelf picks.** Nemotron Lightning turns your context (weekly things, today's plan, memories you approved) into generic topic queries of a few words. Code scrubs them. Results are screened by domain, path, quality and safety rules plus a Lightning adult-audience check. YouTube videos are kept only from listed, verified channels.
- **Appointment lookup.** One tap searches for services, meetups, classes and therapy directories in your region, with a reason for each result.

Your own words are never sent verbatim to search. Names, contact details, long numbers and risk language are removed or rejected in code. In Talk, the proposal card shows the exact query before it runs. `KOE_SEARCH=off` turns search off, and saved picks stay readable.

## Safety and privacy design

- **Code decides, the model proposes.** Plans, permissions, counts, reminders and safety rules are deterministic. Every model output is validated and replaced by a plain version if it fails.
- **Risk handling.** Pattern rules run on every free-text field, and a model classifier runs on every Talk turn. If the classifier fails, no normal reply is shown. A hit pauses coaching and shows fixed "are you safe right now?" wording with Help contacts. Koe never writes a crisis number itself.
- **Honest about being an AI.** Talk shows "Koe is an AI, not a person or a therapist. It can get things wrong."
- **Fixed guardrails.** No weight, calorie or diet content, no light-box therapy, supplements, medication, diagnoses, streaks or promises of results.
- **Privacy.** Free text is encrypted at rest (AES-256-GCM, `DATA_ENCRYPTION_KEY`). Memory can be turned off, and then nothing from your records goes to a model. You can export or delete everything. Guest accounts are deleted after 14 days idle. Logs never contain your text.
- **Limits.** A per-person daily AI budget (200 calls), site-wide daily caps (2,000 AI calls, 300 searches), and kill switches `KOE_AI=off` and `KOE_SEARCH=off`.

## Why the day plan works the way it does

- Everything starts small, and a lighter day is always one tap away. Starting is often the hardest part.
- Plans mix things you used to enjoy, practical tasks and basics, in the spirit of behavioural activation.
- Koe checks how an entry went afterwards and adapts. It never promises enjoyment or a result.

This is background research, not proof that Koe works. See [docs/evidence.md](docs/evidence.md) for the sources and their limits.

## Run it locally

You need Node 24. Locally the database is PGlite (embedded Postgres), so you do not need to install a database.

macOS or Linux:

```bash
npm ci
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # run twice: AUTH_SECRET, DATA_ENCRYPTION_KEY
npx web-push generate-vapid-keys                                              # optional, for reminders
```

Windows (PowerShell):

```powershell
npm ci
Copy-Item .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # run twice: AUTH_SECRET, DATA_ENCRYPTION_KEY
npx web-push generate-vapid-keys                                              # optional, for reminders
```

Edit `.env.local`: paste the two generated secrets, add `NEBIUS_API_KEY` and `TAVILY_API_KEY`, and keep `DATABASE_URL=file:./.data/pglite`. Then:

```bash
npm run build && npm start
```

Open http://127.0.0.1:3100. Without keys, set `KOE_AI=off` and `KOE_SEARCH=off` and the app still runs.

Useful commands: `npm run check` (format, lint, typecheck, unit tests, build), `npm run test:e2e` (Playwright), `npm run demo:seed` (sample data).

## Deploy

`render.yaml` is a Render blueprint for one always-on Node web service. Create a Postgres database anywhere (for example Neon), then in Render set `APP_URL`, `DATABASE_URL`, `NEBIUS_API_KEY`, `TAVILY_API_KEY` and the `VAPID_*` values. `AUTH_SECRET` and `DATA_ENCRYPTION_KEY` are generated for you. Keep a copy of `DATA_ENCRYPTION_KEY`: without it, stored text cannot be read.

Run a single instance. The reminder scheduler and rate limits live in the server's memory.

## Tests and quality

- Unit and component tests with Vitest: 53 test files in `tests/` (`npm test`).
- End-to-end tests with Playwright on desktop and a 390 px phone width, with the AI off. They include axe accessibility checks on every page (`npm run test:e2e`).
- Live evals against the real models: `npm run eval:safety`, `npm run eval:plan`, `npm run eval:interview`. They check safety behaviour, plan rules and interview limits with deterministic checks.

Architecture, data model and the AI system are described in [ARCHITECTURE.md](ARCHITECTURE.md). Help line sources are in [docs/help-resources-sources.md](docs/help-resources-sources.md).

## Limits

- Early preview. Not a medical device, and not tested in a clinical trial.
- No clinician has reviewed the risk patterns or the crisis flow yet.
- Email verification and password reset by email are not available yet.
- Help numbers were checked from public pages on the dates shown in the app, not by test calls. Check locally before relying on them.
- One server instance. Shelf results are screened by code and a model, not reviewed by a person.
- Models can be wrong. Koe says so and does not give medical advice.

Found a security problem? See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
