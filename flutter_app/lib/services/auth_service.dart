import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService {
  final SupabaseClient client;
  AuthService(this.client);

  bool isEmail(String identifier) => identifier.trim().contains('@');

  String normalizePhone(String value) {
    var phone = value.trim().replaceAll(RegExp(r'[^0-9+]'), '');
    if (phone.startsWith('+')) return phone;
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    if (digits.length == 10) return '+91$digits';
    if (digits.length == 11 && digits.startsWith('0')) return '+91${digits.substring(1)}';
    if (digits.length == 12 && digits.startsWith('91')) return '+$digits';
    return '+$digits';
  }

  Future<void> sendOtp(String identifier) async {
    final value = identifier.trim();
    if (isEmail(value)) {
      await client.auth.signInWithOtp(
        email: value.toLowerCase(),
        shouldCreateUser: false,
      );
    } else {
      await client.auth.signInWithOtp(
        phone: normalizePhone(value),
        shouldCreateUser: false,
      );
    }
  }

  Future<AuthResponse> verifyOtp({
    required String identifier,
    required String token,
  }) {
    final value = identifier.trim();
    if (isEmail(value)) {
      return client.auth.verifyOTP(
        email: value.toLowerCase(),
        token: token.trim(),
        type: OtpType.email,
      );
    }
    return client.auth.verifyOTP(
      phone: normalizePhone(value),
      token: token.trim(),
      type: OtpType.sms,
    );
  }

  Future<void> signOut() => client.auth.signOut();

  Future<String?> resolveRole(String userId) async {
    final row = await client.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (row != null) return row['role']?.toString().toLowerCase();

    // A verified OTP session may claim an existing customer record with the
    // exact same registered mobile number. The Edge Function performs the
    // match and link with service-role privileges; the app never writes roles.
    try {
      final link = await client.functions.invoke('link-existing-customer');
      if (link.status >= 200 && link.status < 300) {
        final data = link.data;
        if (data is Map && data['role'] != null) {
          return data['role'].toString().toLowerCase();
        }
      }
    } catch (_) {
      // A non-customer (for example, a technician) may not have a customer
      // row. Preserve the existing technician role-resolution fallback.
    }

    final phone = client.auth.currentUser?.phone;
    if (phone == null || phone.isEmpty) return null;
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    final local = digits.length > 10 ? digits.substring(digits.length - 10) : digits;
    final techRows = await client.from('technicians').select('id,name,mobile,status').eq('mobile', local).limit(1);
    if (techRows.isEmpty) return null;
    final tech = Map<String,dynamic>.from(techRows.first);
    await client.from('profiles').insert({'id': userId, 'full_name': tech['name'], 'phone': phone, 'role': 'technician'});
    return 'technician';
  }
}
