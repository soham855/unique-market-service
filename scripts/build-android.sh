#!/usr/bin/env bash
set -e
npm install
npm run build
npx cap add android || true
npx cap sync android
cd android
./gradlew assembleDebug
