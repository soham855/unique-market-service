import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService {
  final SupabaseClient client;
  AuthService(this.client);

  Future<void> sendOtp(String phone) => client.auth.signInWithOtp(phone: phone.trim());

  Future<AuthResponse> verifyOtp({required String phone, required String token}) {
    return client.auth.verifyOTP(phone: phone.trim(), token: token.trim(), type: OtpType.sms);
  }

  Future<void> signOut() => client.auth.signOut();

  Future<String?> resolveRole(String userId) async {
    final row = await client.from('profiles').select('role').eq('id', userId).maybeSingle();
    return row?['role']?.toString().toLowerCase();
  }
}
