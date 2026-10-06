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
    if (row != null) return row['role']?.toString().toLowerCase();

    final phone = client.auth.currentUser?.phone;
    if (phone == null || phone.isEmpty) return null;
    final digits = phone.replaceAll(RegExp(r'\\D'), '');
    final local = digits.length > 10 ? digits.substring(digits.length - 10) : digits;
    final techRows = await client.from('technicians').select('id,name,mobile,status').eq('mobile', local).limit(1);
    if (techRows.isEmpty) return null;
    final tech = Map<String,dynamic>.from(techRows.first);
    await client.from('profiles').insert({'id': userId, 'full_name': tech['name'], 'phone': phone, 'role': 'technician'});
    return 'technician';
  }
}
