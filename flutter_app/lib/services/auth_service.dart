import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService {
  final SupabaseClient client;
  AuthService(this.client);

  bool isEmail(String identifier) => identifier.trim().contains('@');

  String normalizePhone(String value) {
    final compact = value.trim().replaceAll(RegExp(r'[\s()-]'), '');
    if (compact.startsWith('+')) return compact;
    final digits = compact.replaceAll(RegExp(r'\D'), '');
    if (digits.length == 10) return '+91$digits';
    if (digits.length == 11 && digits.startsWith('0')) {
      return '+91${digits.substring(1)}';
    }
    if (digits.length == 12 && digits.startsWith('91')) return '+$digits';
    if (digits.length >= 10 && digits.length <= 15) return '+$digits';
    throw Exception('Enter a valid mobile number with country code.');
  }

  Future<void> sendOtp(String identifier) async {
    final value = identifier.trim();
    if (value.isEmpty) throw Exception('Enter your registered mobile number or email.');
    if (isEmail(value)) {
      await client.auth.signInWithOtp(email: value.toLowerCase(), shouldCreateUser: false);
    } else {
      final phone = normalizePhone(value);
      final digits = phone.replaceAll(RegExp(r'\D'), '');
      if (digits.length < 10 || digits.length > 15) {
        throw Exception('Enter a valid mobile number with country code.');
      }
      await client.auth.signInWithOtp(phone: phone, shouldCreateUser: false);
    }
  }

  Future<AuthResponse> verifyOtp({
    required String identifier,
    required String token,
  }) {
    final value = identifier.trim();
    final code = token.trim();
    if (code.length != 6 || !RegExp(r'^\d{6}$').hasMatch(code)) {
      throw Exception('Enter the 6-digit OTP.');
    }
    if (isEmail(value)) {
      return client.auth.verifyOTP(
        email: value.toLowerCase(),
        token: code,
        type: OtpType.email,
      );
    }
    return client.auth.verifyOTP(
      phone: normalizePhone(value),
      token: code,
      type: OtpType.sms,
    );
  }

  Future<void> signOut() => client.auth.signOut();

  Future<String?> resolveRole(String userId) async {
    final row = await client
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
    if (row != null) return row['role']?.toString().toLowerCase();

    // First-time phone sign-in: link only an exact registered technician mobile.
    final phone = client.auth.currentUser?.phone;
    if (phone == null || phone.isEmpty) return null;
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    final local = digits.length > 10 ? digits.substring(digits.length - 10) : digits;
    final techRows = await client
        .from('technicians')
        .select('id,name,mobile,status')
        .eq('mobile', local)
        .limit(2);
    if (techRows.length != 1) return null;
    final tech = Map<String, dynamic>.from(techRows.first);
    final status = (tech['status'] ?? 'active').toString().toLowerCase();
    if (!['active', 'online', 'available'].contains(status)) return null;

    await client.from('profiles').insert({
      'id': userId,
      'full_name': tech['name'],
      'phone': phone,
      'role': 'technician',
    });
    return 'technician';
  }
}
