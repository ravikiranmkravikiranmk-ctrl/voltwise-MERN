# Review and fixes

## Changes made

- Fixed the workspace test commands to pass explicit `*.test.js` files to Node's test runner. The previous directory argument failed in the review environment.
- Hardened project-list pagination: invalid, zero, negative, and non-numeric limits now fall back to 50; valid limits are floored and capped at 200.
- Rejected arrays where project/settings objects are expected, instead of accepting them as generic JavaScript objects.
- Improved the JSON fallback store's safety: only a missing data file is treated as an empty store; malformed/unreadable existing data now raises an error instead of silently resetting the in-memory store. Writes now use a uniquely named temporary file and atomic rename, with restrictive file permissions.
- Corrected the API test count in the README.

## Verification performed

- Engine test suite: 16 passed.
- JavaScript source syntax checks: passed.
- API tests and React production build: not completed in this environment because npm dependency installation could not finish (network/package registry unavailable; Express was not installed).
- Flutter tests: not run because the Flutter SDK is not installed in this environment.

## Before submission

Run `npm ci`, `npm test`, and `npm run build` from the project root. If you have Flutter installed, run `cd mobile && flutter pub get && flutter test` as well. Configure `MONGO_URI` to use MongoDB; otherwise the backend uses its local JSON fallback store.

Electrical sizing outputs are preliminary estimates. Confirm the installation method, ambient temperature, grouping, short-circuit withstand, protection coordination, earthing, and applicable IS/IEC requirements with a qualified electrical engineer before construction.
