# Instant Services for Your Security — Flutter App

This directory is reserved for the standalone Flutter mobile application.

## Architecture
- Flutter mobile UI only
- Existing Supabase backend remains shared
- Existing React website remains untouched
- Android-first, Play Store AAB ready
- Roles: Admin, Customer, Technician

## UI separation
The Flutter app must never import or modify the existing React website UI. It will use its own screens, navigation, theme, assets, and mobile-specific UX.

## Backend
Use the existing Supabase project configuration from the app environment/secrets. Do not hard-code production secrets into source control.
