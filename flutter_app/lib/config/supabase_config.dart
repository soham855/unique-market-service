import 'package:flutter/foundation.dart';

class SupabaseConfig {
  static const url = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://tfscvycomllamoubtlcf.supabase.co',
  );

  // Supabase publishable client key is safe to ship in a mobile app.
  // Database security must be enforced with Supabase RLS policies.
  static const publishableKey = String.fromEnvironment(
    'SUPABASE_PUBLISHABLE_KEY',
    defaultValue: 'sb_publishable_VeJIjcsILLniCHf2HjA20A_xlMydma0',
  );

  static bool get isConfigured => url.isNotEmpty && publishableKey.isNotEmpty;

  static void validate() {
    if (!isConfigured) {
      debugPrint('Supabase is not configured.');
    }
  }
}
