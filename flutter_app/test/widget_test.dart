import 'package:flutter_test/flutter_test.dart';
import 'package:instant_services/main.dart';
import 'package:instant_services/technician_main.dart' as technician;

void main() {
  test('Unique Market app root can be constructed', () {
    expect(const UniqueMarketApp(), isA<UniqueMarketApp>());
  });

  test('Technician app root can be constructed', () {
    expect(const technician.TechnicianApp(), isA<technician.TechnicianApp>());
  });
}
