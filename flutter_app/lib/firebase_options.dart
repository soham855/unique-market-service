import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart' show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError('Web Firebase configuration is not enabled for this mobile app.');
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      default:
        throw UnsupportedError('Firebase is configured for Android only.');
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyAoMTvvOJie0F2WI6PKveX_M2XQo6Wa5sg',
    appId: '1:751652431599:android:4cf162fec1756d61089d1a',
    messagingSenderId: '751652431599',
    projectId: 'service-hub-222ho',
    storageBucket: 'service-hub-222ho.firebasestorage.app',
  );
}
