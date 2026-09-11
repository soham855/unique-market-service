import 'package:flutter_test/flutter_test.dart';
import 'package:workspace_reminder/main.dart';

void main() {
  testWidgets('Workspace Reminder starts', (tester) async {
    await tester.pumpWidget(const WorkspaceReminderApp());
    expect(find.text('Workspace Reminder'), findsOneWidget);
  });
}
