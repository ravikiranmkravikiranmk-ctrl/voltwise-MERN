# Voltwise mobile (Flutter)

The Flutter client of the Voltwise estimator. It ships a Dart port of the
shared engine, so the app calculates **fully offline**; the MERN API is used
only to save and load projects.

## Run

Platform folders (`android/`, `ios/`) are not shipped — generate them once, which
adds only the missing files and leaves `lib/` untouched:

```bash
flutter create --platforms=android,ios --org com.voltwise --project-name voltwise_mobile .
flutter pub get
flutter run
```

## API base URL

`lib/services/api_client.dart` defaults to `http://10.0.2.2:4000`, which is how
the Android emulator reaches the host machine. Change it for other targets:

| Target | Base URL |
| --- | --- |
| Android emulator | `http://10.0.2.2:4000` |
| iOS simulator / desktop | `http://localhost:4000` |
| Physical device | `http://<your-lan-ip>:4000` |

If the API is not running the app simply shows "Offline — calculations run on
the device" and keeps working.

## Structure

```
lib/
├── core/engine.dart      Dart port of packages/engine/src/core.js
├── core/tables.dart      cable + transformer reference data
├── core/format.dart      Indian digit grouping
├── services/api_client.dart
├── state/estimator_controller.dart   ChangeNotifier: schedule, settings, report
├── screens/studio_screen.dart
└── widgets/              load_row, metric_card, demand_bar
```

## Tests

```bash
flutter test              # 19 tests, mirrors the Python/JS expectations
dart tool/verify_engine.dart   # parity check with no packages needed
```

`tool/verify_engine.dart` prints every check and exits non-zero on any mismatch
against the values produced by the original Python engine.
