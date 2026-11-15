import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:instant_services/theme/instant_theme.dart';
import 'package:instant_services/theme/instant_dashboard_banner.dart';
import 'package:instant_services/theme/instant_quick_action.dart';

void main() {
  test('Instant theme uses approved brand colors', () {
    final theme = InstantTheme.light();
    expect(theme.useMaterial3, isTrue);
    expect(theme.colorScheme.primary, InstantTheme.green);
    expect(theme.appBarTheme.backgroundColor, InstantTheme.yellow);
  });

  testWidgets('Dashboard banner displays role title and subtitle', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: InstantTheme.light(),
      home: const Scaffold(body: InstantDashboardBanner(
        eyebrow: 'FIELD SERVICE',
        title: 'My work today',
        subtitle: 'Manage assigned jobs',
        icon: Icons.engineering_outlined,
      )),
    ));
    expect(find.text('FIELD SERVICE'), findsOneWidget);
    expect(find.text('My work today'), findsOneWidget);
    expect(find.text('Manage assigned jobs'), findsOneWidget);
  });

  testWidgets('Quick action opens its callback on tap', (tester) async {
    var taps = 0;
    await tester.pumpWidget(MaterialApp(
      theme: InstantTheme.light(),
      home: Scaffold(body: InstantQuickAction(
        icon: Icons.work_outline,
        label: 'All Jobs',
        onTap: () => taps++,
      )),
    ));
    await tester.tap(find.text('All Jobs'));
    expect(taps, 1);
  });
  for (final role in <String, List<String>>{
    'Customer': ['Book Service', 'My Requests', 'AMC'],
    'Technician': ['All Jobs', 'Schedule', 'Profile'],
    'Admin': ['Complaints', 'Customers', 'Technicians', 'Payments', 'Reports', 'AMC'],
  }.entries) {
    testWidgets('${role.key} dashboard shortcuts respond to tap', (tester) async {
      final tapped = <String>[];
      await tester.pumpWidget(MaterialApp(
        theme: InstantTheme.light(),
        home: Scaffold(body: SingleChildScrollView(
          child: Column(children: [
            for (final label in role.value)
              SizedBox(
                height: 110,
                width: 200,
                child: InstantQuickAction(
                  icon: Icons.touch_app,
                  label: label,
                  onTap: () => tapped.add(label),
                ),
              ),
          ]),
        )),
      ));
      for (final label in role.value) {
        await tester.ensureVisible(find.text(label));
        await tester.tap(find.text(label));
        await tester.pump();
      }
      expect(tapped, role.value);
    });
  }

}
