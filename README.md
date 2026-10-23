# EDITH Charge

Private EV-charger access rentals with explicit host approval. This extends the existing Next.js 15 / React / TypeScript / Tailwind / Zustand application and its Express / Prisma / PostgreSQL backend. Public stations and EV trip planning support the rental journey. One account can drive and host; administrator access remains separate.

## Run locally

Node.js 22.12+ (Node 24 recommended) and npm are required. PostgreSQL is required for persistence. Google Maps and AI keys are not required for rentals.

1. `npm ci`
2. Copy `.env.local.example` to both `.env.local` and `.env`. Replace `JWT_SECRET` with a long random value. Keep these files private.
3. In a terminal run `npm run db:local`. This optional development helper starts **real PostgreSQL** bound to `127.0.0.1:54329`, storing data under `.local/postgres`. Keep this terminal open. For an existing PostgreSQL installation, set `DATABASE_URL` in both environment files instead and skip this helper.
4. `npm run db:generate`
5. `npm run db:deploy`
6. `npm run db:seed`
7. In another terminal run `npm run server` (API port 3001).
8. In another terminal run `npm run dev` (web port 3000). Open [EDITH Charge](http://localhost:3000).

Stop processes with Ctrl+C. Restarting the development database reuses its existing data. Do not delete `.local/postgres` to restart. Migrations extend the existing models without dropping historical tables. Never run `prisma migrate reset` on an existing database.

After initial setup and `npm run build`, use `npm run local` to start PostgreSQL, the API and the production web app together in the background. It checks the configured database and API before declaring readiness, reuses running services and retains existing data. Open http://localhost:3000/ afterward. Run the command again after restarting Windows. Startup logs are saved under `.local/runtime/`. Rebuild after changing frontend code; use the separate development terminals above while actively developing.

The deterministic development seed upserts labelled synthetic Kochi listings, dated availability and demo accounts. It does not wipe your database. Seed accounts and public fixtures are development data, not evidence of real charger availability or business operations. Do not run the demo seed against production.

## Demo accounts

| Account | Email | Password |
| --- | --- | --- |
| Driver | `driver@edith.demo` | `EdithDemo123!` |
| Host | `host@edith.demo` | `EdithDemo123!` |

Both accounts can switch between driving and hosting. New accounts use the existing sign-up/login service. Saved vehicles belong to the signed-in account. Local MVP demo mode also accepts any typed car model and skips connector restrictions; it does not verify real compatibility.

See [DEMO.md](DEMO.md) for the complete two-account walkthrough. Use the Admin link in the header or `/admin/login`. Local seeded credentials: `admin@evcharge.com` / `Admin@123`. The dashboard and login use the same white/charcoal design.

## Booking rules

- `REQUESTED → CONFIRMED → IN_PROGRESS → COMPLETED`.
- Requests may be declined, cancelled or expired. Confirmed bookings may be cancelled before their start; hosts must provide a reason.
- Pending requests **do not reserve capacity** and may overlap. Host acceptance checks ownership, expiry, the complete availability window and conflicting reservations inside a PostgreSQL transaction locking the connector.
- Intervals are half-open `[start, end)`: a booking ending at 11:00 can be followed by one starting at 11:00.
- Request expiry is enforced by server reads and actions. `BOOKING_RESPONSE_MINUTES` controls the response deadline, capped by rental start.
- The server calculates the reserved duration and charges integer paise. The amount is rounded up to the nearest paise: `ceil(hourlyRatePaise × durationMinutes / 60)`. INR 120/hour for 90 minutes is INR 180. No service fee is configured.
- The request quote is snapshotted and preserved through acceptance. Later rate edits do not reprice existing requests or accepted bookings.
- Rental end is start plus reserved duration. Travel ETA and response deadline are separate. Starting a session is permitted only within its reserved interval; application check-in does not operate the physical charger.
- Payment is explicitly **“Demo payment — no money collected.”** Booking values are not earnings or payouts. Actual delivered energy remains unknown.
- Public station bookings are explicit EDITH simulations when `DEMO_MODE=true`. They confirm simulated EDITH capacity with a fixed demo tariff of INR 120/hour. They are never sent to a real operator and do not reserve physical capacity. Private rentals still require host acceptance. Disable demo mode to restore strict connector checks and disable public simulations.
- All host forms use Asia/Kolkata time; API timestamps and database values use UTC.

## Maps and trips

The integrated application uses **Leaflet + OpenStreetMap** tiles, **Photon** place search and **OSRM** driving directions. No Google Maps key is needed. The white/charcoal workspace fills the page beneath the header. Each discovery or trip page shows its own map inside the workspace, without a second background map. Private rentals remain the default.

Place searches and routes go through the Express API. The demo proxy caches and deduplicates requests, serialises upstream calls at a maximum of one per 1.2 seconds, and never implements background place autocomplete. Map tiles retain visible OpenStreetMap attribution and normal browser caching; there is no offline tile download or bulk prefetch.

Public community services are suitable for this light hackathon demo and have no availability guarantee. For a deployed commercial service, configure an appropriate hosted or self-hosted provider rather than relying on shared demo endpoints. Provider URLs can be changed with `MAP_GEOCODER_URL`, `MAP_ROUTER_URL` and `NEXT_PUBLIC_MAP_TILE_URL` (restart/rebuild frontend for the latter). Keep appropriate attribution when changing tiles. See the [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/), [Photon demo-server guidance](https://github.com/komoot/photon#demo-server) and [OSRM demo-server policy](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server).

OSRM estimates do not include live traffic or future departure-time traffic forecasts. Resolved locations are shown for review. A failed or incomplete route is reported honestly; manual itineraries and rental requests still work. Road legs are checked with a maximum 1 km snap radius. Battery figures are estimates based on the selected model and editable planning assumptions; they do not establish real feasibility. A selected stop is not a reservation. Route/departure changes flag linked bookings for review and never move, cancel or replace them.

Public Stations automatically loads the labelled OSM directory snapshot for Kochi on entry and offers an explicit live refresh. The bundled snapshot contains 315 actual mapped records captured on 23 October 2026 in the documented Kochi–Delhi bounding area; it is partial coverage, not an India-wide directory or live telemetry. Data attribution: OpenStreetMap contributors, ODbL 1.0; per-record source links are retained. Search a city and radius (15–100 km); every returned unique station gets a popup marker and the list loads 30 cards at a time. A directory cannot guarantee all existing stations or live availability. OSM socket tags supply connectors and rated power only when explicitly recorded; unknown values stay unknown.

Trip planning queries the entire road corridor rather than four sampled areas. Long routes use an indexed bounding-area query followed by distance-to-segment filtering. Select a saved car, the Nexon 30.2 kWh or MG ZS 50.3 kWh planning preset, or type any model. Full-charge range, starting SOC, reserve, charging target, battery capacity and average charge power are editable. Suggested stations are routed as actual OSRM waypoints; road distances/times replace the corridor preview. Duration uses energy divided by the lower of recorded station power and the user average, allowing 10% loss and 5 minutes to plug in. Traffic, elevation, queues and battery taper are not modelled.

**Fill directory gaps with synthetic demo chargers** is a visible MVP option, enabled for a new demo trip. These invented road points are labelled in results and are not evidence of physical chargers. Turn it off to inspect actual directory coverage gaps. Unknown connectors require the separate provisional-stop option. Use suggested stops adds an itinerary, not a booking. Existing linked reservations are retained and changes require review.

If an older Windows local database uses WIN1252, `node scripts/migrate-local-utf8.mjs` makes a UTF-8 copy, checks per-table counts and updates local configuration while retaining the source database. New local databases use UTF-8.

## Validation

- `npm run type-check`
- `npm run build`
- `npm run test:rentals` (real PostgreSQL required; isolated synthetic test fixtures)

See [docs/VALIDATION.md](docs/VALIDATION.md) for the checks actually run in this workspace and remaining limits.

## Charging concierge

With demo mode enabled, AI Concierge defaults to **Demo autopilot**. Say or type “Book me a charger slot for my Tata Nexon EV.” It selects a manufacturer-referenced demo preset, fetches its official reference online (with a labelled reviewed-preset fallback), checks a compatible synthetic bay, budget and calendar, then saves a CONFIRMED simulation on the first request. Defaults are Kalamassery/Kochi, the next free interval, one hour and INR400; stated needs override them. Nexon EV45, Tiago EV24 and MG ZS EV50.3 presets are included. Variant selection is assumed, never verification of the user's actual car. Unknown models require a supported choice. No operator is contacted, physical capacity reserved or money collected.

Replies use a local **Kokoro neural English voice** with replay controls, replacing browser speech synthesis. Run `npm run voice:prepare` to download/cache the model and generate a sample. The API also warms it in the background. First setup requires Internet access and downloads roughly 100MB under ignored `.local/kokoro`; inference uses the server CPU and needs no additional API key. Autoplay restrictions show a play control. Voice input still uses the browser speech service with an editable transcript and typed fallback; actual microphone recognition depends on the device/browser. Sources: [Kokoro JavaScript](https://github.com/hexgrad/kokoro/tree/main/kokoro.js), [ONNX model](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX).

Turn off Demo autopilot for the verified host workflow: it asks for necessary missing details, checks evidence and prepares a priced proposal for driver confirmation, then waits for private host acceptance. Trip charging estimate retains the battery/destination planner.

The AI Concierge tab uses optional Ollama Cloud text interpretation and server-owned compatibility, calendar, budget and booking checks. Configure `OLLAMA_API_KEY` privately on the server. The separate verified workflow uses host specification/parking confirmations and driver session reports as timestamped evidence. No live telemetry is claimed. See [docs/AI_BACKLOG.md](docs/AI_BACKLOG.md) for implementation, assumptions and later host assistance.

## AI Demo Lab

Open **AI Concierge → AI Demo Lab** for a guide grounded in EDITH rules and up to four published private listings, with English, Hindi and Malayalam answers and visible source records. **Host insights → Analyze hosting** reads only the signed-in account's private charger activity. Counts are calculated by the server; AI explains them and suggests manual next actions. Demo booking value is not revenue.

**Draft a host listing** opens the normal listing form. Expand **Start with an AI listing draft**, load synthetic demo notes or select a charger-label image, then generate, edit/select fields and explicitly apply them. Coordinates, calendar windows, restricted instructions, equipment verification and saving remain in the normal host workflow. `OLLAMA_VISION_MODEL=gemma4:31b` enables the separate vision model; `gpt-oss:20b` remains the text model. The image fixture at `public/demo/charger-label.png` is a labelled synthetic illustration, not evidence of real equipment.

The lab's **Use offline demo examples** option deliberately bypasses the model and labels its result. It does not pretend to analyze images. AI tools are authenticated, read-only and rate-limited. Submitted public notes/images, questions with limited public listing records, or owner activity aggregates go to Ollama only when that tool is run; private instructions, guest identities and raw booking history are excluded. Keep keys in ignored server environment files.

See [AI feature research](docs/AI_RESEARCH.md) for the sourced 14-feature roadmap and data requirements, [DEMO.md](DEMO.md) for the rehearsal, and [validation](docs/VALIDATION.md) for checks actually completed. `npm run demo:ai-assets` recreates the sample image. `npm run test:ai-live` exercises the configured models using synthetic notes/image and seeded demo accounts; it creates no listings or bookings.
