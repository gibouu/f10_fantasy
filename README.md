# F10 Fantasy

F10 Fantasy is the Next.js web/API repository for F10 Racing, a Formula 1
pick'em app where users predict the race winner, P10 finisher, and a DNF
driver. The app serves the web experience, Auth.js sessions, Prisma-backed
business logic, and cron endpoints called by AWS Lambda/EventBridge.

## Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Fill `.env.local` with development credentials. Do not commit real secrets.

## Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful checks:

```bash
npm run test:services
npm run test:routes
npm run test:scripts
npx tsc --noEmit
npm run lint
npm run build
```

See [AGENTS.md](AGENTS.md) and
[ai/docs/architecture.md](ai/docs/architecture.md) before making non-trivial
changes. The architecture doc is the codebase map and the shared source of
truth for service boundaries, API routes, data flow, and verification order.

## Operations

Scheduled jobs are not Vercel Cron jobs. They are AWS Lambda/EventBridge jobs
that POST to the cron API routes with `CRON_SECRET`. See
[ai/docs/cron-operations.md](ai/docs/cron-operations.md) for the runbook.

Use Vercel CLI 54.15.0 or newer for deployment-related local commands:

```bash
npm i -g vercel@latest
vercel --version
```

Install the latest CLI before deployment work; this repo expects 54.15.0 or
newer.
