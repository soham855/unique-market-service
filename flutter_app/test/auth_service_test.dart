import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../lib/services/auth_service.dart';

void main() {
  final auth = AuthService(
    SupabaseClient('https://example.supabase.co', 'test-key'),
  );

  group('AuthService input normalization', () {
    test('accepts valid email addresses containing s', () {
      expect(auth.isValidEmail('soham.mane@example.com'), isTrue);
      expect(auth.isValidEmail('user@example.com'), isTrue);
    });

    test('rejects malformed email addresses', () {
      expect(auth.isValidEmail('soham@localhost'), isFalse);
      expect(auth.isValidEmail('not-an-email'), isFalse);
    });

    test('normalizes an Indian mobile number with spaces and punctuation', () {
      expect(auth.normalizePhone('098765 43210'), '+919876543210');
      expect(auth.normalizePhone('+91 (98765) 43210'), '+919876543210');
    });
  });
}
