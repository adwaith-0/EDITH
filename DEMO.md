# EDITH Charge demo

Run the API, frontend and PostgreSQL using [README.md](README.md). All catalogue records in the seeded Kochi demo are synthetic. Times shown in forms and booking summaries are Asia/Kolkata. No money is collected.

## Driver requests private charging

1. Open [the app](http://localhost:3000), sign in as `driver@edith.demo` / `EdithDemo123!`, and choose **Rent a Charger**.
2. Select the saved compatible Type 2 vehicle. Choose a future start and 90 minutes within the listing's dated availability. Search Kochi or the area shown on a card.
3. Open the available Type 2 private charger. Review host-entered rated power, access/parking conditions, hourly price and available windows. These details do not certify electrical safety or report live telemetry.
4. Review the server quote. At INR 120/hour, 90 minutes totals INR 180 (no additional fee). Review the start/end and cancellation summary.
5. Explicitly send the booking request. The application shows **Request sent — waiting for host approval.** The status is **Requested**, and pending requests do not reserve capacity.
6. Open **My Bookings**. Refreshing or signing out/in retrieves the same request from PostgreSQL.

Demo mode accepts any typed vehicle and skips connector restrictions. A period outside the host window is still rejected. With DEMO_MODE=false, incompatible connectors are rejected too. Paused listings do not accept new requests.

## Host reviews and accepts

1. Sign out, then sign in as `host@edith.demo` / `EdithDemo123!`. Switch to **Host**.
2. The dashboard counts owned listings, pending requests, accepted upcoming bookings and active sessions from the database. Money is labelled **Demo booking value**.
3. Open the booking requests. Review the driver's saved vehicle, interval and immutable quote; accept the driver's request.
4. Refresh the host view. The request is now **Confirmed**. Sign back in as the driver and open **My Bookings**: the same record is confirmed and provides navigation/access instructions.
5. Return as host. A second request overlapping that confirmed interval cannot be accepted. A request beginning exactly when the first ends is eligible.
6. Before start, the host can cancel an accepted reservation with a reason, or the driver can cancel their own reservation. Declined/cancelled/expired requests remain in history.

## Host publishes a charger

1. In Host mode open **My Chargers**, then create a listing.
2. Enter title, address, latitude/longitude, connector and AC/DC, verified rated power, hourly rate, parking/public instructions and optional restricted entry instructions/image URL.
3. Add explicit dated windows with a start and end. Times are entered in Asia/Kolkata and stored in UTC. Publish the listing.
4. Switch to driving and find it in discovery. The public listing does not reveal restricted entry codes.
5. Edit or pause your own listing. Pausing prevents new requests and retains accepted bookings. Removing availability that covers a confirmed booking fails with a conflict message.

## Session and demo receipt

At the reserved start, the owner confirms check-in/start. The server refuses early starts, starts after the reserved end, and cancelled/expired/completed records. The booking becomes **In progress**. Complete it after the session; both accounts retain the session timestamps and **Completed** status.

The persisted session receipt records the reserved amount and says **Demo payment — no money collected.** There is no host payout or measured-energy claim. Application start/complete events do not remotely control a physical charger.

For a live rehearsal, create a slot a few minutes in the future; no time-travel or hidden start bypass is provided in the UI. Automated tests use isolated synthetic fixtures to exercise the session window.

## Trip with a private charging stop

1. Choose **Plan a Trip**. Enter origin, destination and departure; optionally add an intermediate stop and battery/range information. Battery percentage is optional.
2. Calculate no-key OSRM driving directions and review the resolved places. If the public routing service is unavailable, keep a manual itinerary; no fabricated road distance or ETA is displayed.
3. Inspect private rentals/public discovery stops. Add a private stop, choose its rental interval and open the same quote/request flow used in Rent a Charger.
4. Return to the itinerary. The linked booking displays its actual backend state, such as **Awaiting host** or **Confirmed**. Adding a stop alone is labelled **Booking required**.
5. Change origin, destination or departure after confirmation. The itinerary flags linked bookings for review; the backend reservation remains at its original time.
6. Public stations offer explicitly labelled demo reservations. Select a popup or card, type any car name, review the demo tariff, reserve, then inspect the saved simulation in My Bookings. No real operator receives the reservation.

## Useful checks

- Sign out and back in to show persistence.
- Try to accept an overlapping request; see the conflict state.
- Use a short request-response deadline and refresh after it expires; see **Expired**.
- Open the app at a narrow mobile viewport to rehearse forms and booking summaries.
- No Google Maps key is required: verify the OpenStreetMap view and OSRM route, and check manual fallback if a public service is unavailable.

See [docs/VALIDATION.md](docs/VALIDATION.md) for the evidence actually obtained in the implementation workspace.

## AI Demo Lab rehearsal

1. Sign in with a seeded demo account and open **AI Concierge → AI Demo Lab**. Leave **Use offline demo examples** off to exercise the configured cloud model.
2. Ask whether a pending private rental request reserves capacity. Inspect the AI label and cited EDITH rule records. Ask to compare listed chargers; open a cited listing to review its details. Switch **Answer language** to Malayalam or Hindi and ask again.
3. Choose **Draft a host listing**, expand **Start with an AI listing draft**, and load **SYNTHETIC demo notes**. Generate and inspect the extracted fields and missing coordinates/calendar. Edit a preview field, uncheck a field to preserve, then click **Apply … fields to form**. Nothing has been saved or published.
4. For vision, clear the notes if you want an image-only check, choose **Try demo label image**, and generate again. The clearly synthetic label prints Type 2, AC and 7.4 kW; it supplies no price, location or availability. Review every extracted value. The image is an illustration, not an equipment inspection.
5. Close the unsaved form. Open **Host insights → Analyze hosting**, or switch to hosting and select **AI Host**. Review the account's actual counts and suggested manual actions. An empty account shows onboarding suggestions; seeded host credentials in this document provide existing demo listings. Booking value is not revenue.
6. Turn on **Use offline demo examples** and rerun the guide or notes draft to rehearse without the provider. The result explicitly says no model was used. Photographs are excluded in offline mode.

The wider sourced roadmap is in [docs/AI_RESEARCH.md](docs/AI_RESEARCH.md). Queue forecasting, demand-based prices, predictive maintenance and proven carbon savings require real telemetry/history/energy data and are not presented as working demo features.

## Model-based long-trip demo

1. Start a **New trip** and enter Kochi, Kerala to Delhi, India with a future departure.
2. Select the Nexon 30.2 kWh preset and set starting battery to 80%. Review the editable 220 km planning range and 25 kW average charging assumption.
3. Keep the visible synthetic gap-filling option checked for an MVP simulation; turn it off to inspect real directory gaps. Click **Plan trip & charging stops**.
4. Inspect all returned route stations on the map and the numbered recommended stops, arrival SOC, target SOC, charge duration and IST arrival/departure times. Synthetic stops are labelled.
5. Choose MG ZS 50.3 kWh and replan with its 340 km planning range / 40 kW average assumption. The number and locations of stops change.
6. Public Stations automatically loads real mapped Kochi results. Radius 100 km searches a wider area; counts are the actual unique results, not a fabricated target of 100 stations.
7. Open **Admin**, sign in with the local seeded credentials shown on the login screen, and inspect booking values, history and cancellation controls.


## Charging concierge

With demo mode enabled, the voice booking agent now defaults to **Demo autopilot**:

1. Sign in as the demo driver and open **AI Concierge**. Leave Demo autopilot enabled.
2. Say or type **“Book me a charger slot for my Tata Nexon EV.”** The first response saves a confirmed, compatible simulation without a connector/date/location questionnaire.
3. Review the assumed Nexon45 variant, official manufacturer source link and whether its reference was retrieved live or a reviewed preset was used. Kalamassery/Kochi, next available slot, 60 minutes and INR400 are displayed defaults; the demo tariff is INR120/hour.
4. Listen to the Kokoro neural reply or use the audio/replay controls. First setup can be prepared with `npm run voice:prepare`. Browser voice input still needs a supported browser and microphone permission; Malayalam is beta and reply audio is English.
5. Open **My Bookings** to see the same saved simulation. This does not reserve a physical charger, contact a real operator or collect money. Repeating the same immediate request reuses its booking; cancelling and requesting again creates a new simulation.
6. Try **“Book my MG ZS EV in Kochi tomorrow at 10 am for 90 minutes, under 250 rupees.”** Explicit needs override defaults and model changes select another preset. Tiago EV is also supported.

Turn off Demo autopilot to exercise the stricter host workflow with driver confirmation and separate host acceptance. **Trip charging estimate** opens the earlier battery/destination workflow below:

1. Sign in as the demo driver and select AI Concierge. Choose Try the example, then Understand request. A configured Ollama Cloud key fills Kochi, Aluva,18% and INR400. Review all fields; manual entry also works.
2. Choose the saved Nexon, review range/capacity/average power, select a future departure and confirm its saved connector. Search without demo opt-in to see the real evidence requirement. Seeded listings intentionally remain synthetic and unconfirmed.
3. Explicitly include labelled demo listings for a rehearsal. Review road detour, estimated stop, price, source, calendar-check time and unknown equipment condition. Estimates are not a reachability guarantee.
4. Review booking & payment preview obtains a fresh server quote with car/slot/duration bound to the reviewed proposal. Submit only if desired. A private request still waits for separate host acceptance. No money is collected.
5. As host, My Chargers offers Confirm equipment & parking. Only save actual checked information; demo records always retain their source label. Technical/parking edits require renewed confirmation.
6. On an owned confirmed/completed booking, Report issue / outcome records a timestamped observation. Failures exclude that listing from the concierge until a host reports resolution. Find alternative charging restores the driver's needs and excludes that listing; it never automatically cancels or replaces a reservation.
