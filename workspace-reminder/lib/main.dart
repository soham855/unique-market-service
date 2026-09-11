import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest.dart' as tz;
import 'package:timezone/timezone.dart' as tz;
import 'package:intl/intl.dart';
import 'package:flutter_background_geofencing/flutter_background_geofencing.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  tz.initializeTimeZones();
  await ReminderService.init();
  runApp(const WorkspaceReminderApp());
}

class Reminder {
  final String id;
  String title;
  DateTime? dateTime;
  String? location;
  double? latitude;
  double? longitude;
  int radius;
  String repeat;
  bool done;

  Reminder({required this.id, required this.title, this.dateTime, this.location,
    this.latitude, this.longitude, this.radius = 100, this.repeat = 'None', this.done = false});

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'dateTime': dateTime?.toIso8601String(),
    'location': location, 'latitude': latitude, 'longitude': longitude, 'radius': radius, 'repeat': repeat, 'done': done};
  factory Reminder.fromJson(Map<String, dynamic> j) => Reminder(id: j['id'], title: j['title'],
    dateTime: j['dateTime'] == null ? null : DateTime.parse(j['dateTime']), location: j['location'],
    latitude: (j['latitude'] as num?)?.toDouble(), longitude: (j['longitude'] as num?)?.toDouble(),
    radius: j['radius'] ?? 100, repeat: j['repeat'] ?? 'None', done: j['done'] ?? false);
}

class ReminderService {
  static final notifications = FlutterLocalNotificationsPlugin();
  static final geo = GeofencingService();

  static Future<void> init() async {
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    await notifications.initialize(const InitializationSettings(android: android));
    await notifications.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.requestNotificationsPermission();
    await geo.initialize();
    try { await geo.requestPermissions(); await geo.startService(notificationTitle: 'Workspace Reminder', notificationText: 'Location reminders are active'); } catch (_) {}
    geo.onGeofenceEvent.listen((event) async {
      if (event.type == GeofenceEventType.enter) {
        await notifications.show(event.regionId.hashCode.abs(), 'Workspace Reminder',
          'You reached ${event.regionId}', const NotificationDetails(android: AndroidNotificationDetails('workspace_location', 'Location reminders', importance: Importance.max, priority: Priority.high)));
      }
    });
  }

  static Future<void> schedule(Reminder r) async {
    if (r.dateTime == null) return;
    final when = tz.TZDateTime.from(r.dateTime!, tz.local);
    if (when.isBefore(tz.TZDateTime.now(tz.local))) return;
    final repeat = r.repeat;
    if (repeat == 'Daily') {
      await notifications.zonedSchedule(r.id.hashCode.abs(), r.title, 'Workspace Reminder', _nextDaily(when),
        const NotificationDetails(android: AndroidNotificationDetails('workspace_time', 'Time reminders', importance: Importance.max, priority: Priority.high)),
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle, matchDateTimeComponents: DateTimeComponents.time);
    } else if (repeat == 'Weekly') {
      await notifications.zonedSchedule(r.id.hashCode.abs(), r.title, 'Workspace Reminder', when,
        const NotificationDetails(android: AndroidNotificationDetails('workspace_time', 'Time reminders', importance: Importance.max, priority: Priority.high)),
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle, matchDateTimeComponents: DateTimeComponents.dayOfWeekAndTime);
    } else {
      await notifications.zonedSchedule(r.id.hashCode.abs(), r.title, 'Workspace Reminder', when,
        const NotificationDetails(android: AndroidNotificationDetails('workspace_time', 'Time reminders', importance: Importance.max, priority: Priority.high)),
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle);
    }
  }

  static tz.TZDateTime _nextDaily(tz.TZDateTime t) {
    final now = tz.TZDateTime.now(tz.local);
    var x = tz.TZDateTime(tz.local, now.year, now.month, now.day, t.hour, t.minute);
    if (x.isBefore(now)) x = x.add(const Duration(days: 1));
    return x;
  }

  static Future<void> addGeofence(Reminder r) async {
    if (r.latitude == null || r.longitude == null) return;
    try { await geo.addGeofence(GeofenceRegion(id: r.id, latitude: r.latitude!, longitude: r.longitude!, radius: r.radius.toDouble(), data: {'title': r.title})); } catch (_) {}
  }

  static Future<void> cancel(String id) => notifications.cancel(id.hashCode.abs());
}

class WorkspaceReminderApp extends StatelessWidget {
  const WorkspaceReminderApp({super.key});
  @override Widget build(BuildContext context) => MaterialApp(title: 'Workspace Reminder', debugShowCheckedModeBanner: false,
    theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo, brightness: Brightness.light),
    darkTheme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo, brightness: Brightness.dark), themeMode: ThemeMode.system,
    home: const HomePage());
}

class HomePage extends StatefulWidget { const HomePage({super.key}); @override State<HomePage> createState() => _HomePageState(); }
class _HomePageState extends State<HomePage> {
  List<Reminder> reminders = []; int tab = 0;
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { final p = await SharedPreferences.getInstance(); final raw = p.getStringList('reminders') ?? []; setState(() => reminders = raw.map((e) => Reminder.fromJson(jsonDecode(e))).toList()); }
  Future<void> save() async { final p = await SharedPreferences.getInstance(); await p.setStringList('reminders', reminders.map((r) => jsonEncode(r.toJson())).toList()); }
  Future<void> add() async { final r = await showDialog<Reminder>(context: context, builder: (_) => const AddReminderDialog()); if (r == null) return; setState(() => reminders.add(r)); await save(); await ReminderService.schedule(r); await ReminderService.addGeofence(r); }
  Future<void> toggle(Reminder r) async { setState(() => r.done = !r.done); await save(); }
  Future<void> remove(Reminder r) async { await ReminderService.cancel(r.id); setState(() => reminders.remove(r)); await save(); }
  List<Reminder> get visible { final now = DateTime.now(); if (tab == 1) return reminders.where((r) => !r.done && r.dateTime != null && r.dateTime!.year == now.year && r.dateTime!.month == now.month && r.dateTime!.day == now.day).toList(); if (tab == 2) return reminders.where((r) => !r.done && (r.dateTime == null || r.dateTime!.isAfter(now))).toList(); return reminders; }
  @override Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Workspace Reminder', style: TextStyle(fontWeight: FontWeight.w700)), actions: [IconButton(onPressed: add, icon: const Icon(Icons.add_task))]),
    body: visible.isEmpty ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.event_available, size: 64, color: Theme.of(context).colorScheme.primary), const SizedBox(height: 12), const Text('No reminders yet', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)), const SizedBox(height: 6), const Text('Add a task with time or location')]) : ListView.builder(padding: const EdgeInsets.all(12), itemCount: visible.length, itemBuilder: (_, i) { final r = visible[i]; return Dismissible(key: ValueKey(r.id), background: Container(color: Colors.red, alignment: Alignment.centerLeft, padding: const EdgeInsets.only(left: 20), child: const Icon(Icons.delete)), direction: DismissDirection.startToEnd, onDismissed: (_) => remove(r), child: Card(child: ListTile(contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8), leading: Checkbox(value: r.done, onChanged: (_) => toggle(r)), title: Text(r.title, style: TextStyle(fontWeight: FontWeight.w600, decoration: r.done ? TextDecoration.lineThrough : null)), subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [if (r.dateTime != null) Text('🕒 ${DateFormat('dd MMM yyyy, hh:mm a').format(r.dateTime!)}'), if (r.location != null) Text('📍 ${r.location}')]), trailing: r.repeat != 'None' ? Text(r.repeat) : null))); }),
    floatingActionButton: FloatingActionButton.extended(onPressed: add, icon: const Icon(Icons.add), label: const Text('Add Reminder')),
    bottomNavigationBar: NavigationBar(selectedIndex: tab, onDestinationSelected: (v) => setState(() => tab = v), destinations: const [NavigationDestination(icon: Icon(Icons.list_alt), label: 'All'), NavigationDestination(icon: Icon(Icons.today), label: 'Today'), NavigationDestination(icon: Icon(Icons.upcoming), label: 'Upcoming')]));
}

class AddReminderDialog extends StatefulWidget { const AddReminderDialog({super.key}); @override State<AddReminderDialog> createState() => _AddReminderDialogState(); }
class _AddReminderDialogState extends State<AddReminderDialog> {
  final title = TextEditingController(), location = TextEditingController(); DateTime? date; TimeOfDay? time; String repeat = 'None';
  @override Widget build(BuildContext context) => AlertDialog(title: const Text('New Reminder'), content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [TextField(controller: title, autofocus: true, decoration: const InputDecoration(labelText: 'What do you need to do?', prefixIcon: Icon(Icons.task_alt))), const SizedBox(height: 8), ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.calendar_month), title: Text(date == null ? 'Date' : DateFormat('dd MMM yyyy').format(date!)), onTap: () async { final d = await showDatePicker(context: context, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 3650)), initialDate: date ?? DateTime.now()); if (d != null) setState(() => date = d); }), ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.schedule), title: Text(time == null ? 'Time' : time!.format(context)), onTap: () async { final t = await showTimePicker(context: context, initialTime: time ?? TimeOfDay.now()); if (t != null) setState(() => time = t); }), TextField(controller: location, decoration: const InputDecoration(labelText: 'Location (optional)', prefixIcon: Icon(Icons.location_on)),), const SizedBox(height: 8), DropdownButtonFormField<String>(value: repeat, decoration: const InputDecoration(labelText: 'Repeat'), items: const ['None','Daily','Weekly'].map((x) => DropdownMenuItem(value: x, child: Text(x))).toList(), onChanged: (x) => setState(() => repeat = x!))])), actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')), FilledButton(onPressed: () { if (title.text.trim().isEmpty) return; DateTime? dt; if (date != null && time != null) dt = DateTime(date!.year, date!.month, date!.day, time!.hour, time!.minute); Navigator.pop(context, Reminder(id: DateTime.now().microsecondsSinceEpoch.toString(), title: title.text.trim(), dateTime: dt, location: location.text.trim().isEmpty ? null : location.text.trim(), repeat: repeat)); }, child: const Text('Save'))]);
}
