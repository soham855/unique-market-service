import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService {
  final SupabaseClient _client;

  AuthService(this._client);

  Future<AuthResponse> signIn({required String email, required String password}) {
    return _client.auth.signInWithPassword(email: email.trim(), password: password);
  }

  Future<void> signOut() => _client.auth.signOut();

  Future<String?> resolveRole(String userId) async {
    final row = await _client
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
    return row?['role']?.toString().toLowerCase();
  }
}
