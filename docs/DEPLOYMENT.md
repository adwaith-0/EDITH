# Vercel demo deployment

`vercel.json` deploys Next.js and the exported Express HTTP server as two Vercel
Services sharing one domain. `/api/*`, `/health`, and `/socket.io/*` reach the
backend; other requests reach Next.js. Production browser requests use the same
origin by default. `NEXT_PUBLIC_API_URL` remains an optional separate API override.

## Required production configuration

- Node.js 24 and Fluid Compute.
- A persistent PostgreSQL database, such as the Neon Free marketplace integration.
  `DATABASE_URL` is the pooled runtime connection; `DATABASE_URL_UNPOOLED` is used
  for migrations when available. Local embedded PostgreSQL is never uploaded.
- A new private `JWT_SECRET` and the existing private `OLLAMA_API_KEY` as Vercel
  secrets. Never use the `NEXT_PUBLIC_` prefix for credentials.
- `OLLAMA_MODEL=gpt-oss:20b`, `OLLAMA_VISION_MODEL=gemma4:31b`.
- `DEMO_MODE=true` and `NEXT_PUBLIC_DEMO_MODE=true` for the explicitly labelled
  hackathon simulation. No real payments or operator reservations are made.
- `NEXT_PUBLIC_REALTIME_ENABLED=true` and
  `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` for the native WebSocket and Kokoro runtime.
- Leave `NEXT_PUBLIC_API_URL` unset for the shared-domain deployment.

The backend function has 2 GB memory and a 300-second maximum duration. Kokoro
downloads its model into writable temporary storage on its first speech request.
WebSockets reconnect when an invocation closes; database polling also refreshes
booking state. In-memory rooms do not coordinate separate function instances.

## Database initialization

Run `npm run db:deploy` against the new cloud database before public verification.
Run the synthetic seed once with `DEMO_MODE=true`, `ALLOW_DEMO_SEED=true`, a private
`ADMIN_EMAIL`, and a randomly generated `ADMIN_PASSWORD` of at least 16 characters.
The cloud seed rejects the local default administrator credentials and preserves
existing records. Do not expose administrative credentials in the frontend or Git.

The seed adds the documented driver/host demo accounts and dated calendar windows.
It can be rerun to append missing demo dates without resetting changed listings or
existing reservations. This is a synthetic demonstration, not a production
marketplace launch.

## Verification

`EDITH_DEPLOYMENT_URL=https://<deployment> npm run test:deployment` checks the live
website, database readiness, maps, owner authorization, request replay, approval,
capacity conflicts, authenticated WebSockets, text/vision drafting, multilingual
guidance, owner insights, demo agent, and generated Kokoro WAV data. To check the
administrator API too, supply private `EDITH_ADMIN_EMAIL` and
`EDITH_ADMIN_PASSWORD` in the process environment. Reports are saved under ignored
`test-results/`. Skipped checks are reported explicitly. The checker creates only
named synthetic QA records, cancels its bookings and pauses its listing afterward.

Also inspect the deployed UI on desktop and mobile. Physical microphone capture
requires the user's device permission and is not established by an HTTP test.

References: [Vercel Services](https://vercel.com/docs/services),
[WebSockets](https://vercel.com/docs/functions/websockets),
[function limits](https://vercel.com/docs/functions/limitations), and
[Neon managed integration](https://neon.com/docs/guides/vercel-managed-integration).
