# Architecture

## One engine, three callers

```
                    ┌──────────────────────────────┐
                    │  packages/engine (JS, 0 deps)│
                    │  tables · core · csv         │
                    └───────────┬──────────────────┘
                                │ import
        ┌───────────────────────┼────────────────────────┐
        │                       │                        │
┌───────▼────────┐      ┌───────▼────────┐      ┌────────▼─────────┐
│ Express API    │      │ React web app  │      │ Flutter app      │
│ estimate +     │      │ instant local  │      │ Dart mirror of   │
│ projects CRUD  │      │ preview        │      │ the same rules   │
└───────┬────────┘      └───────┬────────┘      └────────┬─────────┘
        │                       │  /api (save, load)     │ /api (optional)
        │              ┌────────▼────────┐               │
        └──────────────►  MongoDB / JSON  ◄──────────────┘
                       └─────────────────┘
```

The engine is the only place where electrical rules live. The API imports it directly; the React app imports it from the same workspace package so typing in the schedule produces a result without a round trip; the Flutter app ships a line-for-line Dart port so it works with no network at all.

`packages/engine/test/golden.json` was generated from the original Python implementation *before* the port, and both the JS and Dart suites assert against it. That is what keeps three implementations honest.

## Request flow (web)

1. `LoadSchedule` / `Sidebar` write into `App` state.
2. `App` runs `estimate({ loads, settings })` in a `useMemo` — pure, synchronous, no API call.
3. "Save project" issues `POST /api/projects` (or `PUT` when a project is open). The API re-runs the *same* engine server-side and stores the report, so a saved project always carries a report computed from authoritative rules.
4. Project list, load, delete go through the API and refresh the sidebar.

If the API is unreachable the app says so and keeps calculating locally; only saving is disabled.

## Backend layers

| Layer | File | Responsibility |
| --- | --- | --- |
| Bootstrap | `src/server.js` | connect DB, listen, graceful shutdown |
| App factory | `src/app.js` | CORS, body parsers, routes, 404, error handler — exported so tests can mount it |
| Routes | `src/routes/*.js` | HTTP shape only |
| Validation | `src/middleware/validateProject.js` | normalises and bounds-checks a payload; load rules come from the engine |
| Service | `src/services/estimateService.js` | wraps `estimate()` and adds `meta` |
| Repository | `src/repositories/*.js` | one interface, two stores (Mongoose / JSON file) |
| Model | `src/models/Project.js` | schema, indexes, `toJSON` → `id` |

### Why two stores

MERN means MongoDB, and MongoDB is what `docker compose up` and production use. But requiring a database to try a calculator is friction, and CI should not need one either. So `projectRepository` picks Mongoose when `MONGO_URI` is connected and a small JSON file store otherwise. Both implement `list / findById / create / update / remove`, so routes never branch. `/api/health` reports which is live.

### Error handling

`ValidationError` is thrown by the engine for every bad input, and carries `status = 400`. Mongoose validation errors are mapped to `400` with a `details` array. Everything else is logged and answered with a generic `500`, so internals never leak. `asyncHandler` funnels rejected promises into the same handler.

## Web app

React 18 with plain hooks — no state library, because the state is one schedule, one settings object and a project id. Charts are CSS bars rather than a charting dependency, keeping the production bundle at ~170 kB (~55 kB gzipped).

The visual system (`web/src/styles.css`) is a direct port of the original Streamlit theme: the same ink/panel/cyan/lime palette, Manrope + DM Mono, the same section numbering and card chrome.

## Flutter app

```
lib/
├── core/        engine.dart (port), tables.dart, format.dart
├── services/    api_client.dart  (http, optional)
├── state/       estimator_controller.dart (ChangeNotifier)
├── screens/     studio_screen.dart
└── widgets/     load_row, metric_card, demand_bar
```

- `EstimatorController` holds schedule + settings, recomputes on every edit and exposes `report` / `error`.
- `AnimatedBuilder` rebuilds the screen — no external state package.
- The API client is used only for save/load/list; all numbers come from the local Dart engine, so the app is fully usable offline.

## Data model

```
Project
├── name, client, site, notes      strings
├── loads[]                        { name, quantity, ratedKw, powerFactor, demandFactor, phases }
├── settings                       { voltage, phases, diversityFactor, derating, maxVdPct,
│                                    cableLengthM, maxRuns, maxLoading, futureMargin }
└── lastReport                     the full estimate report (summary, feeder, cable,
                                   transformer, breakdown, warnings)
```

`lastReport` is denormalised on purpose: opening a project shows its numbers without recomputing, and a report is a historical record of what was quoted.

## Testing strategy

| Suite | Where | What it proves |
| --- | --- | --- |
| Engine (16) | `packages/engine/test` | the 12 original Python tests plus CSV round-trip, estimate report and empty-schedule behaviour |
| API (7) | `backend/test` | routes, validation → 400, CSV import, project lifecycle against the file store |
| Dart (19) | `mobile/test` | same expectations as the Python suite, plus formatting |
| Golden vectors | `golden.json` | JS and Dart agree with the original Python engine to 0.01 |
| Dart smoke run | `mobile/tool/verify_engine.dart` | engine parity with no packages installed |

## Deliberate trade-offs

- **Duplicate engine in Dart.** A Flutter app cannot import JavaScript, and calling the API for every keystroke would make the phone useless offline. Duplication is contained by golden vectors and identical test expectations.
- **JSON file store.** Convenience only; it is not concurrency-safe. Use MongoDB for anything shared.
- **No auth.** Projects are global to the deployment. Adding JWT auth would be the first extension — the repository interface already isolates storage.
