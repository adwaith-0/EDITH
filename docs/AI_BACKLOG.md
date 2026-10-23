# Charging concierge and evidence

The concierge has two booking modes plus the existing trip estimate. Ollama interprets text; authenticated server tools own all booking state. No custom model training is performed.

## MVP demo autopilot (current default in demo mode)

“Book me a charger slot for my Tata Nexon EV” completes in one turn. The server selects a reviewed Nexon45 / Tiago24 / MG ZS50.3 preset, fetches an allowlisted official manufacturer reference with a five-second per-source timeout and six-hour cache, persists an owned synthetic vehicle, geocodes the area, creates/reuses a clearly synthetic EDITH demo bay, checks compatible Type2 equipment, budget and calendar, and saves CONFIRMED simulated capacity through the existing locked booking service. Live HTTP retrieval is reported separately from curated specification values; an outage uses a labelled reviewed preset. There is no arbitrary web search, model-generated specification parser or actual-car verification. Variant/capacity assumptions and source links are shown. Other vehicle models require a supported choice rather than fabricated specs.

Displayed defaults are Kalamassery/Kochi, next available quarter-hour interval, 60 minutes and INR400. Explicit model/area/time/duration/budget override them. If AI interpretation fails, known model-only requests may use those displayed defaults; stated location/time/budget constraints must not be silently discarded. If the default place lookup fails, a labelled approximate demo centre is used; other unresolved areas fail without a booking. This is not a GPS/travel-time or battery-reachability assessment. Synthetic bay pricing is INR120/hour. Conflicts can move the simulated slot later and the returned actual interval is shown. Immediate identical requests in the same 15-minute default-start bucket are idempotent, including concurrent submissions; a cancelled booking is not revived. A new request in a later bucket may choose a new free slot. Negative requests do not book. DEMO_AUTOPILOT is restricted to server-created catalogue vehicles and agent-demo PUBLIC_DEMO stations; it cannot automatically accept real/private host reservations. No physical capacity, payment or external operator action occurs.

The UI sends `mvpQuickBook` explicitly only when its demo toggle is enabled. Disable DEMO_MODE and NEXT_PUBLIC_DEMO_MODE to remove this rehearsal path. The private host flow described below retains evidence checks, review and host acceptance.

## Local neural reply audio

Kokoro-JS with the official ONNX-community q8 model generates English af_heart voice audio on the server CPU. Model files are cached under ignored .local/kokoro; `npm run voice:prepare` warms the model and writes test-results/edith-neural-voice.wav. API startup warms it without blocking bookings. Authenticated bounded POST /api/concierge/speech returns 24kHz mono PCM WAV. Requests are rate-limited, inference concurrency is bounded and failure leaves the booking intact. Reply text is not logged or sent to a TTS vendor. Currency/EV/connector abbreviations are expanded, long replies are split without cutting decimals, and concise booking speech avoids reading URLs or record IDs.

The client pauses reply audio when listening starts or a new request begins, cancels stale fetches and releases audio URLs. It exposes native play/replay controls when autoplay is blocked. Browser speech synthesis has been removed from the agent. Voice recognition still uses browser SpeechRecognition; typed and editable transcripts remain available. English reply audio does not imply evaluated Malayalam recognition.

Sources: [Kokoro-JS](https://github.com/hexgrad/kokoro/tree/main/kokoro.js), [model](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX); per-model manufacturer links are retained in server/services/demoVehicleCatalogue.js and returned to the driver.

## Trip charging estimate and verified host mode

The trip estimate's capture_charging_needs tool extracts explicitly stated origin, destination, battery percentage and INR budget. Missing fields stay unknown. The driver reviews the form, chooses an owned saved vehicle and confirms its actual connector. Manual input works without AI.

Set OLLAMA_API_KEY and optionally OLLAMA_MODEL in private server environment files, then restart the API. The default model is gpt-oss:20b; requests go directly to https://ollama.com/api/chat. The key never enters client code or API responses. Only the submitted message goes to Ollama, not account details, host entry codes or booking history. The interface explains transmission before submission. Requests allow 1,500 characters and ten authenticated concierge calls per minute. Text is not saved as a chat transcript. Extracted needs persist in a submitted booking snapshot.

Tool calling is validated on the server. Ollama Cloud currently does not support structured-output schema mode. Provider failure or invalid output returns an actionable error; the manual form remains usable. References: [Cloud](https://docs.ollama.com/cloud), [tool calling](https://docs.ollama.com/capabilities/tool-calling), [structured outputs limitations](https://docs.ollama.com/capabilities/structured-outputs).

## Evidence before recommendations

Hosts explicitly confirm recorded connector/power specifications, write a public evidence note, state whether parking is included and report working/unavailable/unknown equipment. This is timestamped self-report, not independent certification or live telemetry. Technical/location edits clear specification confirmation; parking/terms edits clear parking inclusion. Drivers can report issues/failures on owned confirmed/active/completed bookings, and successful outcomes after completion. Unresolved equipment reports exclude listings. The owner can record a fresh working report to resolve them; previous reports and audit records remain.

Real concierge results require confirmed specifications, included parking and known rated power. Demo records are excluded by default and require explicit opt-in plus server demo mode. Even opted-in demo results must match the saved connector. Legacy manual rental demo flexibility is preserved. Results include calendar check time, host report time, source label and factual 30-day booking-status counts. Unknown condition stays unknown. No online-status claim or learned reliability score is invented.

## Deterministic search and approval

The server verifies Photon/OSRM road routes and checks up to four compatible private host candidates within a 10 km corridor. This is a first-stop concierge, not a comprehensive public-station or complete multi-stop optimizer. Existing Public Stations and Plan a Trip support broader discovery. Unknown public data/operator reservations are not promoted into verified private results.

Drivers supply range, capacity and assumed average power. Estimates apply a 20% range buffer, configurable 10-40% reserve, 15% charging loss and ten plug-in minutes. Effective power is the lower of recorded rating and driver assumption less loss allowance. Price uses reserved whole minutes and integer paise. Road detour, arrival estimate, required charge, conflicts, up to 60 minutes of disclosed waiting and rental budget are checked. A stop that cannot cover the destination shows a further-stops warning and no destination ETA. Traffic, terrain, weather, taper, queues and degradation are not measured. These calculations never establish safe reachability.

Search creates no booking or payment. A 15-minute signed proposal binds driver, vehicle, listing, slot, duration, budget and specification snapshot. Review requests a fresh quote. Submission rechecks current evidence, compatibility, calendar and price under PostgreSQL locks. A private booking remains REQUESTED until its owner accepts; acceptance rechecks evidence/compatibility. Payment preparation is an explicit demo amount preview. No real gateway, collection or payout is connected.

After cancellation/decline/expiry or an equipment report, Find alternative charging restores the driver's own needs and excludes the failed listing. The driver must review current departure/location and submit a new request. The original reservation is never automatically moved or cancelled. Hosts cannot see origin/destination/budget constraints in the driver's concierge snapshot.

## AI Demo Lab and host drafting

The new AI Demo Lab adds a source-backed EDITH FAQ/listing comparison in English, Hindi and Malayalam, public host-notes extraction, optional charger-label vision extraction, and explanations of owner-scoped host activity aggregates. These complement the booking agent; they cannot mutate a reservation or publish a listing. See [AI_RESEARCH.md](AI_RESEARCH.md) for primary-source research and the wider roadmap.

The existing text model handles these language tasks. The optional server-only OLLAMA_VISION_MODEL selects a separate vision model, currently gemma4:31b in the local demo. The text-only gpt-oss model is not used to read images. Only readable equipment values enter a reviewable draft; missing facts remain missing. Hosts edit/select the preview and apply it to the ordinary form, then supply coordinates/calendars and save separately. A photo never marks specifications as verified or equipment as working.

These tools have their own explicit disclosure: submitted public notes and a selected image, a guide question with up to four public listing records, or minimum owner activity aggregates are sent to Ollama. Restricted instructions, account/guest identities and raw booking histories are excluded. Images are bounded and processed for the request, not saved as listing photos. Outputs and errors do not expose credentials. The offline demo toggle deliberately bypasses inference and labels deterministic examples; it cannot read a photograph.

Host metrics are server-calculated, not AI predictions. Recorded demo booking value is not collected revenue. Price/calendar changes and publication remain explicit host actions. Forecasting, learned reliability and diagnosis remain later work because there is no validated operational telemetry dataset.

## Later host assistance

Demand-based price/slot suggestions, repeated-cancellation/equipment alerts, draft host replies and validated fault detection are future work. Hosts must approve price/calendar changes. Browser voice input and an experimental Malayalam locale are implemented below; representative Malayalam recognition quality is not evaluated. AI cannot infer safety, live status, delivered energy, payment success or confirmation.

## Voice booking agent

With Demo autopilot turned off, a driver can say or type a general host booking request. The server keeps planning state in a driver-bound, signed 30-minute conversation token, asks for missing area/date/time/duration/budget, uses an owned saved vehicle with explicit connector confirmation, checks compatible host listings, road travel and full calendar slots, and prepares a fresh priced proposal automatically. Browser chat history stays in component memory, not persisted transcripts. Only the latest message, follow-up question and current time go to Ollama. The model has only the capture_booking_request extraction tool; it has no payment or booking mutation tool.

Local search checks up to 100 published host records, takes up to six compatible candidates within 25 km of the resolved area, and returns up to three checked options. Ranking prioritises the requested time, then rental price and driving time. Alternative slots can start up to two hours later and show the delay explicitly. Road travel is from the resolved area without live traffic. Reserved duration is the requested access interval, not a prediction of battery charge time or reachability. Public operator reservations are not connected to the agent. Demo options require explicit opt-in; connector and evidence checks remain strict.

After the exact vehicle, slot and total are shown, a driver can use the confirmation button or the explicit phrase "confirm booking." General requests, extraction output, "yes" alone and negated confirmations cannot commit a reservation. Changed settings or prices require a fresh proposal. One server-generated idempotency key prevents duplicate submissions on retries. Private bookings remain REQUESTED until host acceptance; status refreshes from the backend. Replacement planning excludes an eligible cancelled/failed charger. There is no automatic cancellation, money collection or host calendar/price change.

Voice uses SpeechRecognition/webkitSpeechRecognition on localhost or HTTPS. Microphone permission is requested only after Speak request. The browser may process audio online. Listening stops at phrase end or after 30 seconds and aborts on unmount. Interim/final text is visible, the last transcript is editable and automatic sending can be disabled. Reply audio uses the neural service above. Unsupported browsers and permission/network/microphone/language errors provide typed fallback. English India is the default; Malayalam is beta and depends on the browser service. Offline speech and universal browser support are not claimed. See [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).
