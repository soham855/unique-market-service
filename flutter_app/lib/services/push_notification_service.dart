import 'dart:async';
import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {}
}

class PushNotificationService {
  final SupabaseClient client;
  final _messages = StreamController<RemoteMessage>.broadcast();
  Stream<RemoteMessage> get messages => _messages.stream;

  PushNotificationService(this.client);

  Future<bool> initialize() async {
    try {
      if (Firebase.apps.isEmpty) await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);
      final token = await messaging.getToken();
      if (token != null) await saveToken(token);
      messaging.onTokenRefresh.listen(saveToken);
      FirebaseMessaging.onMessage.listen(_messages.add);
      return token != null;
    } catch (_) {
      return false;
    }
  }

  Future<void> saveToken(String token) async {
    final user = client.auth.currentUser;
    if (user == null || token.trim().isEmpty) return;
    await client.from('fcm_tokens').upsert({
      'user_id': user.id,
      'token': token,
      'platform': Platform.isAndroid ? 'android' : Platform.isIOS ? 'ios' : 'other',
    }, onConflict: 'user_id,token');
  }

  Future<void> removeCurrentToken() async {
    final user = client.auth.currentUser;
    if (user == null) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await client.from('fcm_tokens').delete().eq('user_id', user.id).eq('token', token);
    } catch (_) {}
  }

  void dispose() => _messages.close();
}
