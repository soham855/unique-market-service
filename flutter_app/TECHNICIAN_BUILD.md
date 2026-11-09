# Unique Market Technician App

## Android identity
- Android application ID: `com.uniquemarket.technician`
- Flutter entry point: `lib/technician_main.dart`
- Login: registered mobile OTP or email OTP; only active `technician` profiles are admitted.

## Build
The GitHub Actions workflow builds a separate technician debug APK and release APK. On a pull request it skips the unrelated customer APK/AAB builds to keep technician validation focused.

Local release build:

```bash
cd flutter_app
flutter pub get
flutter analyze
flutter test
flutter build apk --release \
  -t lib/technician_main.dart \
  --dart-define=SUPABASE_URL=https://tfscvycomllamoubtlcf.supabase.co \
  --dart-define=SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

## Firebase / push notifications
Register a separate Android app in the Firebase project with package name `com.uniquemarket.technician`. Add its `google-services.json` as the GitHub Actions repository secret `TECHNICIAN_GOOGLE_SERVICES_JSON` (raw JSON or base64-encoded JSON). Until that app-specific file is configured, the APK still builds and in-app notifications remain available, but FCM push registration is disabled.

## Database and activation prerequisites
Before production release:
1. Review and apply migrations `20261109100001` through `20261109100004`.
2. Deploy the `service-report-otp` Edge Function.
3. In Admin > Technicians & Login Links, map each operational technician row to the correct existing login profile. The app intentionally blocks an unlinked technician profile rather than silently opening a broken job screen.
4. Confirm the WhatsApp worker is running so queued customer approval OTPs are delivered.

## Service workflow
- Accept job, mark On The Way, navigate and verify arrival within the configured GPS radius.
- Foreground live location is shared while the job screen remains open; tracking ends when the technician marks Reached or exits the job screen.
- Start service, save before/after photos, request and verify customer OTP, capture signature, record work/charges, then complete.
- Emergency SOS records the latest available GPS position and appears in the Admin SOS dashboard, which refreshes every 10 seconds.

No production migrations or Edge Functions are deployed by the PR build workflow.
