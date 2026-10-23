# AI features for the EDITH demo

Research date: 24 October 2026, Asia/Kolkata. Official documentation and the current EDITH source were inspected. This is a product and implementation recommendation; verification of the completed build belongs in `VALIDATION.md`.

Implementation update: the recommended demo tools are now available in **AI Concierge → AI Demo Lab** and **AI Host**. Text/label-photo drafting, the multilingual guide/comparison and owner activity explanations were exercised against the configured cloud models. The existing booking workflow remains separate. See [validation evidence](VALIDATION.md) and the [demo walkthrough](../DEMO.md) for the exact checks and limits.

## Recommendation

Extend the working charging concierge into a small assistant workspace for both sides of the marketplace:

1. **Driver assistant:** answer EDITH questions from reviewed product facts and compare published rental records, with visible evidence and unknowns.
2. **Host listing assistant:** turn short host notes into an editable listing draft; optionally read a charger label photo with a vision model. The host reviews and applies the draft through the existing form.
3. **Host insights:** calculate reservation/report aggregates on the server, then explain the numbers and suggest a few next actions. The host remains responsible for edits, prices and availability.

These additions complement the existing voice/text booking journey. They work with data EDITH already has, demonstrate distinct language, vision and explanation capabilities, and do not require training a custom prediction model. Keep the existing manual journeys available when the provider is unavailable.

## What already exists

The source already implements Ollama Cloud extraction of charging needs and booking conversations, browser voice recognition, local Kokoro reply audio, reviewed demo vehicle presets, first-stop charging estimates, signed proposals, and a clearly labelled simulated booking path. Private host bookings still require host acceptance. Compatibility, money arithmetic, calendar checks, reservation locks and booking transitions belong to server services.

The proposed FAQ/comparison, listing draft/photo extraction and host insight workspace were not present when this research began. `AI_BACKLOG.md` explicitly listed host assistance and image extraction as future work. Relevant source: `server/services/conciergeAI.js`, `bookingAgent.js`, `chargingConcierge.js`, `listingEvidence.js`, `rentalService.js`, and `prisma/schema.prisma`.

## Prioritized feature matrix

| Feature | Priority | Data needed | Useful demo behavior | Limitation / later requirement |
| --- | --- | --- | --- | --- |
| Natural language and voice booking | Existing; retain | Driver message, owned vehicle, current calendar, server quote | Ask for missing details and prepare a reviewable booking request | Existing Malayalam recognition is beta; no guarantee of offline or universal browser support |
| Grounded EDITH FAQ | Build now | Reviewed FAQ/policy facts maintained with the app | Explain requesting versus confirmation, pricing units, cancellations, demo payments and evidence labels; show references | Answer only supported EDITH topics; cannot invent policy or operator support |
| Charger comparison | Build now | Published rental connector, rating, price, parking, evidence time and condition | Explain differences and list missing facts using current server records | A listing's rated power is not the vehicle's delivered power; general comparison does not promise a free slot |
| Host listing drafting | Build now | Host-submitted description and current editable public fields | Suggest title, public access description, parking wording and missing details | Preview only; never invent an address, amenities, working status, price, permission or availability |
| Charger label photo extraction | Build now if a supported vision call passes | Host-uploaded photo of the equipment label | Extract readable connector/current/power values into a reviewable draft; expose unreadable fields | A photo is not electrical certification, installation inspection, live status or proof of ownership; no automatic verification/publication |
| Host operational insights | Build now | Owner-scoped booking status/slot/value counts and unresolved reports | Explain recent requests, cancellations, scheduled minutes and listing completeness | Aggregate facts, not demand forecasting; reservation value is not money collected, and booked minutes are not measured charging |
| Draft host replies / translated listing text | Next | Public listing facts and user-approved text | Draft clear answers or bilingual copy for review | Needs representative English/Malayalam evaluation; translation must preserve numbers and booking obligations |
| Trip explanation and preference capture | Existing estimates + next | Reviewed vehicle inputs, routes, deterministic energy assumptions, preferences | Explain why an estimated stop was selected and allow the driver to change assumptions | Do not describe an estimate as safe reachability; telemetry, elevation, weather and charge curves are absent |
| Report summarization and issue alerts | Next | Owner-scoped issue reports and resolution history | Group recurring descriptions and flag records needing review | Show original evidence; a summary cannot diagnose hardware or automatically clear a report |
| Personalized charger recommendations | Later | Consented preferences, meaningful interaction history, checked candidate set | Rank compatible options by explicit price/detour/access preferences | Start with transparent rules; do not claim learned personalization from seed data |
| Queue and arrival forecasting | Later | Operator occupancy/session feeds, queue events, travel data | Show a calibrated probability or forecast with timestamp | EDITH has host calendars, not live public operator queues; current data cannot support this claim |
| Demand forecasting / host price suggestions | Later | Sufficient real request history, availability, prices and outcomes | Forecast intervals with backtesting, then offer host-reviewed suggestions | Cold-start demo records do not establish predictive accuracy; never silently change tariffs or calendar |
| Predictive maintenance / reliability model | Later | Timestamped telemetry, failures, maintenance labels and enough outcomes | Detect validated anomalies and produce evidence-backed alerts | Host self-reports and small outcome counts do not justify a reliability score or safety claim |
| Carbon / charging-cost optimization | Later | Measured energy, local tariff periods, auditable grid factors and vehicle efficiency | Compare disclosed scenarios | Current payment simulation and absent delivered-energy measurements cannot prove emissions saved or realized savings |

The first six rows form the coherent demo scope. The remaining rows are candidate integrations, not claims that EDITH has the data or validation to offer them.

## Evidence from established EV workflows

Google Maps' built-in EV documentation describes compatible charger filtering, estimated arrival battery and adding charging stops with charging time. Availability depends on the car, region and data plan. This supports the usefulness of an assisted planning experience; it does not establish equivalent prediction quality for EDITH, which lacks vehicle telemetry. [Google Maps EV features](https://support.google.com/maps/answer/9773205?hl=en).

ChargePoint documents a connected waitlist that offers a station when space opens and holds it after the driver accepts. That requires operational station/queue state. EDITH can explain its host calendar and request lifecycle today; public-station queue prediction should wait for an operator integration. This is an operational product precedent, not evidence that a language model can observe occupancy. [ChargePoint Waitlist FAQ](https://www.chargepoint.com/drivers/waitlist-faq).

The US Department of Energy explains that charging time depends on battery state, capacity, battery type, vehicle charger capability and the charging equipment. A label's kW rating alone cannot establish session duration. Use this source only for general charging dependencies, not Indian vehicle connector specifications or local installation guidance. [AFDC charging equipment](https://afdc.energy.gov/fuels/electricity-stations#charging-equipment).

## Ollama provider findings

**Keep the current text model for text tasks.** The live public cloud catalogue lists `gpt-oss:20b` with completion, tools and thinking capabilities. It does not list vision for that model. The model page also identifies its inputs as text. Do not send photos to the configured text model and claim they were analyzed. [Live cloud model catalogue](https://ollama.com/api/tags), [gpt-oss model page](https://ollama.com/library/gpt-oss).

**Use a separate supported vision model.** At research time the live catalogue lists `gemma4:31b` with vision and tool support. It also contains other vision-capable models, but catalogue membership does not prove access under the configured account or quality on charger labels. Make the selected vision model configurable and perform an authenticated smoke check before claiming the photo flow works. The published Qwen3-VL model page documents `qwen3-vl:235b-cloud`, but that model is absent from the live cloud catalogue inspected here; do not assume the older example remains available. [Live catalogue](https://ollama.com/api/tags), [Qwen3-VL model page](https://ollama.com/library/qwen3-vl).

**Native image API:** POST to the chat endpoint with `messages: [{role: "user", content: "...", images: ["<base64 image bytes>"]}]` and `stream: false`. Ollama's REST image input expects base64; file-path conveniences belong to the SDKs. Validate actual image type, dimensions and size server-side, bound the request, and transmit only the submitted image. [Ollama Vision API](https://docs.ollama.com/capabilities/vision).

**Cloud transport and privacy:** the official guide uses `https://ollama.com/api/chat`, a bearer API key and the direct model name returned by `/api/tags`. Keep the key on the server. Current documentation says cloud prompts/responses are processed to answer requests and are not used to train models; it does not justify EDITH promising zero retention. Show a clear per-feature disclosure for messages, photos and aggregate summaries before submission. [Ollama Cloud](https://docs.ollama.com/cloud).

**Output validation:** Cloud structured outputs are explicitly unsupported in the current official capability documentation. Tool calling is available, but generated arguments still require schema, field, range and authorization validation in EDITH. Reject unexpected fields or action names. Avoid relying on `format: <JSON schema>` to enforce correctness. Use one bounded extraction tool or a validated draft response and keep all booking mutations outside those tools. [Structured-output limitation](https://docs.ollama.com/capabilities/structured-outputs), [Tool calling](https://docs.ollama.com/capabilities/tool-calling).

For a small product FAQ, an explicit reviewed fact set is sufficient and easier to audit than adding a vector database. If the knowledge base later grows substantially, Ollama documents embeddings for semantic retrieval; retrieval must still respect document ownership and cite the retrieved source. Cloud availability of an embedding model must be verified separately. [Ollama embeddings](https://docs.ollama.com/capabilities/embeddings).

## Implementation boundaries and demo checks

- Fetch comparison records and owner-scoped aggregate facts on the server. Never trust client-supplied booking totals or ownership.
- Keep restricted access instructions, emails, account identifiers, payment data and raw booking histories out of model requests. For insight text send only the minimum aggregate snapshot needed.
- Compute numerical facts deterministically. Display their period, data mode and timestamp. Call totals **reservation value** and make the no-money demo state visible. `Booking.energyKwh` is measured-only and currently unavailable; never convert booked minutes into delivered energy.
- Distinguish **AI-generated draft**, **server-calculated facts**, **host-reported evidence** and **synthetic demo record** in the UI. A model explanation does not strengthen the underlying evidence.
- Listing suggestions require explicit host review/apply, followed by the existing form validation and save. Photo extraction must not set `specificationsVerifiedAt`, `parkingIncluded`, `equipmentStatus`, availability or publication state.
- Exercise one successful text draft, one readable and one unreadable label, a supported and unsupported FAQ question, a comparison with an unknown field, empty owner analytics, cross-owner access rejection, provider timeout and a mobile view. Use adversarial notes/photos as data, never as permission to change rules.
- Keep the booking regression suite passing: no duplicate reservations, no private confirmation without host acceptance, no fabricated price/availability and no account data leakage. Record live model checks separately from mocked tests and screenshots.

Suggested presentation: ask an EDITH booking question, compare current host listings, turn a host's rough notes/photo into an editable draft, then explain the host's factual booking summary. Finish by demonstrating the existing reviewed booking workflow. No custom-model accuracy or real payment claim is needed to make this useful.
