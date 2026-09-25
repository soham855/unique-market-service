import 'dart:async';

import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'firebase_options.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'config/supabase_config.dart';
import 'services/auth_service.dart';
import 'app_localizations.dart';
import 'notifications_page.dart';

final ValueNotifier<Locale> appLocale = ValueNotifier(const Locale('en'));

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final savedLanguage = prefs.getString('language') ?? 'en';
  appLocale.value = Locale(savedLanguage == 'mr' ? 'mr' : 'en');
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  if (SupabaseConfig.isConfigured) {
    await Supabase.initialize(
      url: SupabaseConfig.url,
      publishableKey: SupabaseConfig.publishableKey,
    );
  }
  runApp(const InstantServicesApp());
}


Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
}

Future<void> registerPushToken() async {
  if (!SupabaseConfig.isConfigured) return;
  final user = Supabase.instance.client.auth.currentUser;
  if (user == null) return;

  final messaging = FirebaseMessaging.instance;
  await messaging.requestPermission(alert: true, badge: true, sound: true);
  final token = await messaging.getToken();
  if (token == null || token.isEmpty) return;

  await Supabase.instance.client.from('push_tokens').upsert({
    'user_id': user.id,
    'token': token,
    'platform': 'android',
    'updated_at': DateTime.now().toUtc().toIso8601String(),
  }, onConflict: 'user_id,token');

  FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
    if (newToken.isEmpty) return;
    await Supabase.instance.client.from('push_tokens').upsert({
      'user_id': user.id,
      'token': newToken,
      'platform': 'android',
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }, onConflict: 'user_id,token');
  });
}

final ValueNotifier<Locale> appLocale = ValueNotifier(const Locale('en'));

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final savedLanguage = prefs.getString('language') ?? 'en';
  appLocale.value = Locale(savedLanguage == 'mr' ? 'mr' : 'en');
  if (SupabaseConfig.isConfigured) {
    await Supabase.initialize(
      url: SupabaseConfig.url,
      publishableKey: SupabaseConfig.publishableKey,
    );
  }
  runApp(const InstantServicesApp());
}
