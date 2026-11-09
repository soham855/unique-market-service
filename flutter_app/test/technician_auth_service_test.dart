import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:instant_services/services/auth_service.dart';

void main() {
  final auth = AuthService(
    SupabaseClient('https://example.supabase.co', 'test-publishable-key'),
  );

  group('Technician login identifier', () {
    test('recognizes email identifiers', () {
      expect(auth.isEmail('tech@example.com'), isTrue);
      expect(auth.isEmail('7350060071'), isFalse);
    });

    test('normalizes a 10-digit Indian mobile number', () {
      expect(auth.normalizePhone('7350060071'), '+917350060071');
    });

    test('normalizes a leading-zero Indian mobile number', () {
      expect(auth.normalizePhone('07350060071'), '+917350060071');
    });

    test('normalizes an Indian number already containing country code', () {
      expect(auth.normalizePhone('91 73500 60071'), '+917350060071');
    });

    test('preserves an explicit international country code', () {
      expect(auth.normalizePhone('+1 (212) 555-0100'), '+12125550100');
    });

    test('rejects an invalid phone number', () {
      expect(() => auth.normalizePhone('12345'), throwsException);
    });
  });
}
