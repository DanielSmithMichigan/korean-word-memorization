# Contributor Guide (AGENTS)

This guide orients contributors to the codebase, tooling, environments, and expected workflows for adding features or fixes to the Korean Word Memorization project.

**At a Glance**
- Monorepo with React (Vite) frontend and AWS CDK infra + Lambdas.
- Data stored in DynamoDB; APIs via API Gateway + Lambda.
- Audio generated to S3 via Gemini or Google Cloud TTS.

## Repository Layout
- **`react/`**: Vite + React app (Tailwind). Deployed to S3/CloudFront.
- **`cdk/`**: AWS CDK v2 stack (TypeScript) defining DynamoDB tables, S3 buckets, API Gateways, and Lambdas.
  - **`cdk/lambda/`**: Core word app Lambdas (`word-uploader.js`, `get-word-pairs.js`, `process-guess.js`).
  - **`cdk/text-to-speech-lambda/`**: Generates audio (Gemini or Google Cloud TTS) and uploads to S3.
  - **`cdk/create-quiz-lambda/`**: Generates Overwatch-themed quizzes using Gemini; writes to DynamoDB.
  - **`cdk/quiz-api-lambda/`**: Read-only API to fetch quiz bundles/questions with S3 presigned URLs.
  - **`cdk/lib/cdk-stack.ts`**: Main stack wiring (tables, queues, secrets, APIs, permissions).
- **`parsing-duo/`**: Node script to parse input lines into Korean/English word pairs.
- **`util/`**: Node package for local utilities (Google APIs, wav helpers, etc.).
- Root docs: `README.md` (project vision), `GEMINI.md`, `Overwatch.md`.

## Prerequisites
- **Node.js**: v20+ (repo tested with Node 20).
- **Package managers**: npm or yarn (repo mixes both; follow per-folder `package.json`).
- **AWS**:
  - AWS account and credentials configured (`aws configure`).
  - **CDK v2** globally installed if invoking via CLI (`npm i -g aws-cdk`) or use `npx cdk`.
  - Bootstrapped environment: `cdk bootstrap` (once per account/region).
- **Google**:
  - Gemini API key stored in AWS Secrets Manager as secret JSON: `{ "apiKey": "<key>" }`.
  - Google Cloud TTS service account JSON stored as a secret (raw JSON object).

## Secrets and Environment
- Secrets are created and read by name in the CDK stack:
  - **`GoogleApiKey`**: Gemini API key secret; must contain field `apiKey`.
  - **`GoogleTTSCreds`**: Raw GCP service account JSON (must include `client_email` and `private_key`).
- Do not commit secrets. Use AWS Secrets Manager via the stack-configured names above.

## Frontend (react/)
- **Install**: `cd react && npm install` (or `yarn`)
- **Dev server**: `npm run dev`
- **Build**: `npm run build` → outputs to `react/dist/`
- **Deploy (example scripts)**:
  - `npm run deploy` syncs `dist/` to a project S3 bucket (update bucket name before using).
  - `npm run invalidate` invalidates a CloudFront distribution (update distribution ID).
- **API endpoints**: configured in `react/src/api/endpoints.js`. Update to match your deployed API Gateway URLs or local proxies if applicable.

## Infrastructure (cdk/)
- **Install**: `cd cdk && npm install` (or `yarn`)
- **Build**: `npm run build`
- **Test**: `npm test` (Jest for CDK code)
- **Deploy**:
  - Typical: `npm run deploy` (deploys current synthesized stack).
  - Full deploy with packaged TTS lambda deps: `npm run deployFull`
    - Copies a `package.json` into `text-to-speech-lambda` and installs production deps before `cdk deploy`.
- Stack creates:
  - DynamoDB tables: `WordMemorization` (with GSI `user-timestamp-index`), `OverwatchQuizzes` (with GSI `bundle-id-index`).
  - API Gateways for: Word uploader, Get word pairs, Process guess, Text-to-speech, Create quiz, Quiz API.
  - S3 buckets: audio storage, Korean audio uploads for quiz generation.
  - SQS queue + DLQ for async text-to-speech.

## Core Lambdas and Contracts
- **Word Uploader** (`cdk/lambda/word-uploader.js`)
  - Method: `POST` with query `userId` and body `{ wordPairs: [{ korean, english }], customIdentifier?, id? }`
  - Writes/updates a package: `{ id, userId, timestamp, wordPairs, attempts[], successes[], recentSuccessRate[] }`
  - CORS: `POST, OPTIONS`
- **Get Word Pairs** (`cdk/lambda/get-word-pairs.js`)
  - Method: `GET` with query `userId`, optional `id`, `customIdentifier`, `lastEvaluatedKey`
  - Returns `{ Items, LastEvaluatedKey? }`. Supports pagination and filtering by `customIdentifier`.
  - CORS: `GET, OPTIONS`
- **Process Guess** (`cdk/lambda/process-guess.js`)
  - Method: `POST` body `{ userId, id, englishGuess?, koreanGuess? }`
  - Updates stats with exponential smoothing (`ALPHA = 0.4`) in `recentSuccessRate`.
  - CORS: `POST, OPTIONS`
- **Text-to-Speech** (`cdk/text-to-speech-lambda/index.js`)
  - Triggers: API Gateway (sync) or SQS (async batch).
  - Body `{ korean_word? | english_word?, overwrite?, api_choice? = 'gemini' }` → uploads `<word>.wav` to S3 and returns presigned URL (API path).
  - Uses Gemini TTS or Google Cloud TTS; reads secrets from Secrets Manager; CORS `POST, OPTIONS`.
- **Quiz Generation** (`cdk/create-quiz-lambda/index.js`)
  - Triggers: S3 object created or direct API/Invoke (regenerate path).
  - Uses Gemini with function calling to structure data; validates with Joi; writes to `OverwatchQuizzes`.
- **Quiz API** (`cdk/quiz-api-lambda/index.js`)
  - `GET /bundles` → list of unique `bundle_id`s.
  - `GET /quizzes/{bundleId...}` → items with presigned `korean_audio_url` when `korean_audio_key` exists.

## Local Development Flow
- **Feature work**
  - Update or add React components under `react/src/` and endpoints in `react/src/api/endpoints.js` as needed.
  - Modify or add Lambdas under `cdk/lambda/` (core app) or respective lambda directories for quiz/tts.
  - If adding infra (tables, queues, APIs), update `cdk/lib/cdk-stack.ts` and add least-privilege grants.
- **Testing**
  - Frontend: run `npm run dev` and interact against deployed/stubbed endpoints.
  - CDK: `npm test` for unit tests; use `cdk diff` to review changes.
  - Lambdas: keep handlers small and pure where possible; consider extracting helpers for unit testing (no framework included by default).
- **Validation**
  - Deploy to a dev stack, verify API Gateway URLs, and confirm CORS.
  - For TTS: ensure both `GoogleApiKey` and `GoogleTTSCreds` secrets exist before invoking.

## Coding Standards
- **Languages**: TypeScript for CDK; JavaScript for Lambdas and React.
- **Style**: Prefer clear, small functions; avoid one-letter vars; avoid inline comments unless clarifying non-obvious logic.
- **Linting**: `react/` has ESLint; run `npm run lint` there. Keep code consistent with existing patterns.
- **Error handling**: Return meaningful status codes; include CORS headers for all API Gateway responses.
- **Security**: Use Secrets Manager; do not log secrets; grant least privilege in CDK.

## Branching, Commits, Reviews
- **Branches**: Use short, descriptive names: `feature/<slug>`, `fix/<slug>`, `infra/<slug>`.
- **Commits**: Imperative, scoped messages: `feat(react): add typing test view`.
- **PRs**: Summarize intent, changes, and testing steps; reference related issues.
- **Review checklist**:
  - Dependencies minimal and pinned.
  - CORS and status codes correct.
  - Secrets and env names match stack.
  - IAM grants least privilege.
  - Frontend endpoints updated and documented.

## Adding New Functionality
- **New API**: Add Lambda (folder or in `cdk/lambda`), wire in `cdk-stack.ts`, set CORS and env, expose via API Gateway, deploy, then update frontend endpoints.
- **New data**: Define keys/GSIs up front; add `grantRead/Write` permissions and test queries.
- **New UI**: Keep components small; colocate logic near components; update navigation and API calls.

## Utilities
- **Parsing tool** (`parsing-duo/parser.js`)
  - Reads `parsing-duo/input.txt`, pairs consecutive Korean/English lines, builds an in-memory `wordPairs` array.
  - Consider extending to export or write JSON for import into the uploader flow.

## Common Pitfalls
- Missing secrets in AWS Secrets Manager → TTS and quiz generation fail.
- Out-of-date API URLs in `react/src/api/endpoints.js` → frontend cannot reach backend.
- Skipped `cdk bootstrap` in a new account/region → `cdk deploy` fails.
- CORS headers omitted in new Lambdas → frontend requests blocked.

## Maintenance
- Prefer small, well-scoped PRs.
- Add brief README notes to new subfolders.
- Keep infra and endpoint docs in sync when changing URLs or resources.

---
Questions or proposals for larger changes? Open an issue describing motivation, approach, and impact so we can align before implementation.

