# Migration notes — Python/Streamlit → MERN + Flutter

## What moved where

| Original | Now |
| --- | --- |
| `loadcalc/core.py` (Load, summarise, line_current, voltage_drop_percent, select_cable, select_transformer) | `packages/engine/src/core.js` (API + React) and `mobile/lib/core/engine.dart` (Flutter) |
| `loadcalc/tables.py` | `packages/engine/src/tables.js` and `mobile/lib/core/tables.dart` |
| `app.py` (Streamlit UI, 4 sections, sidebar, CSV upload, CSV download) | `web/src/App.jsx` + `web/src/components/*` (React), and `mobile/lib/screens/studio_screen.dart` (Flutter) |
| `tests/test_core.py` (12 tests) | `packages/engine/test/core.test.js` (12 ported + 4 new) and `mobile/test/engine_test.dart` (19) |
| `examples/sample_loads.csv` | `samples/sample_loads.csv`, seeded into the API by `npm run seed` |
| `requirements.txt`, `pytest.ini`, `requirements-dev.txt` | `package.json` workspaces + `pubspec.yaml` |
| — (state lived in the Streamlit session) | MongoDB/JSON projects: `backend/src/models/Project.js` |
| — (calculations ran in-process) | REST API: `POST /api/estimate`, plus the shared engine for local preview |

## API mapping

| Python | JavaScript | Dart |
| --- | --- | --- |
| `Load(name, quantity, rated_kw, power_factor, demand_factor, phases)` | `new Load({ name, quantity, ratedKw, powerFactor, demandFactor, phases })` | `LoadSpec(name:, quantity:, ratedKw:, powerFactor:, demandFactor:, phases:)` |
| `load.connected_kw` | `load.connectedKw` | `load.connectedKw` |
| `load.demand_kw` / `demand_kvar` | `load.demandKw` / `demandKvar` | `load.demandKw` / `demandKvar` |
| `summarise(loads, diversity_factor)` | `summarise(loads, diversityFactor)` | `summarise(loads, diversityFactor: …)` |
| `line_current(kw, voltage, pf, phases)` | `lineCurrent({ kw, voltage, powerFactor, phases })` | `lineCurrent(kw:, voltage:, powerFactor:, phases:)` |
| `voltage_drop_percent(...)` | `voltageDropPercent({...})` | `voltageDropPercent(...)` |
| `select_cable(...)` | `selectCable({...})` → `{ sizeSqmm, runs, deratedCapacityA, voltageDropPct, limitedBy }` | `selectCable(...)` → `CableChoice` |
| `select_transformer(max_demand_kva, max_loading, future_margin)` | `selectTransformer({ maxDemandKva, maxLoading, futureMargin })` | `selectTransformer(maxDemandKva: …, maxLoading: …, futureMargin: …)` |
| `ValueError` | `ValidationError` (carries `status = 400`) | `ValidationException` |
| — | `estimate({ loads, settings })` → full report | `estimate(loads:, settings:)` → `EstimateReport` |

Naming follows each language: `snake_case` in Python, `camelCase` in JS/Dart. The CSV header stays `name,quantity,rated_kw,power_factor,demand_factor,phases` so old exports still import — the parser also accepts camelCase and `pf`/`df`/`qty` aliases.

## Formula parity

Every formula was copied verbatim, including the ones that are easy to get subtly wrong:

| Step | Formula | Unchanged? |
| --- | --- | --- |
| Reactive power | `Q = P · tan(acos(pf))` | yes |
| kVA combination | `kVA = √(kW² + kVAr²)` — never a sum of kVA | yes |
| Overall pf | `kW / kVA` | yes |
| Max demand | `kVA / diversityFactor` | yes |
| 3-phase current | `P / (√3 · V · pf)` | yes |
| 1-phase current | `P / (V · pf)` | yes |
| Voltage drop | `√3 · I · L · (R cos φ + X sin φ)` (3φ), `2 · I · L · (…)` (1φ) | yes |
| Cable selection | smallest size, then parallel runs, passing **both** ampacity and Vd | yes |
| `limitedBy` label | `current` if the size is the first that meets current alone | yes |
| Transformer | `demand · (1 + margin) / loading`, next standard rating | yes |

One rounding note: the original computed `md_kw = max_demand_kva * pf` and then the current from that. The port computes `maxDemandKw = demandKw / diversityFactor` and feeds it to the same current formula. Algebraically identical (`maxDemandKva · pf = maxDemandKw`), and the golden vectors confirm it to 0.2 A.

## Parity evidence

`packages/engine/test/golden.json` contains values produced by running the **Python** code on the sample schedule with `diversity 1.15, derating 0.9, length 60 m`:

```
demand 87.70 kW · 53.78 kVAr · 102.88 kVA · pf 0.852
feeder 124.46 A · cable 1 × 35 mm² (132.3 A, 1.91 % Vd, limited by current)
transformer 160 kVA (55.9 % loaded)
```

The JS engine, the API, and the Dart engine all reproduce those numbers (`npm test`, `flutter test`, `dart tool/verify_engine.dart`).

## What is genuinely new

- **Persistence** — projects, clients, sites and the last report are stored; the Streamlit version lost everything on reload.
- **CSV import over HTTP** — parsing moved server-side (`POST /api/import/csv`) so the phone can import the same file, and a template endpoint was added.
- **Warnings** — the report now flags voltage drop within 10 % of the limit and an overall power factor below 0.85.
- **Settings object** — the eight sidebar values are one serialisable object, which is what makes saving a study possible.
- **Two clients** — a browser app and an offline-capable mobile app over the same rules.
- **Docker + CI** — `docker compose up` and a GitHub Actions workflow that runs all three suites.

## What was dropped

- Streamlit's `st.data_editor` grid (replaced by an explicit table with inputs, which also works on a phone).
- `pandas` — the CSV parser in `packages/engine/src/csv.js` handles quoting and BOM without a dependency.
- The original `docs/screenshot.png` (the UI is new; take a fresh one).
