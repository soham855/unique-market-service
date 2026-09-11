import 'package:flutter/foundation.dart';

class SupabaseConfig {
  static const url = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://tfscvycomllamoubtlcf.supabase.co',
  );

  static const anonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: '',
  );

  static bool get isConfigured => url.isNotEmpty && anonKey.isNotEmpty;

  static void validate() {
    if (!isConfigured) {
      debugPrint('Supabase is not configured. Pass --dart-define=SUPABASE_ANON_KEY=...');
    }
  }
}
