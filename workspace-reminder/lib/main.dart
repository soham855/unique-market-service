import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_background_geofencing/flutter_background_geofencing.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest.dart' as tz;
import 'package:timezone/timezone.dart' as tz;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  tz.initializeTimeZones();
  await ReminderService.init();
  runApp(const WorkspaceReminderApp());
}

class Reminder {
  Reminder({required this.id, required this.title, this.dateTime, this.location, this.repeat = 'None', this.done = false});
  final String id;
  String title;
  DateTime? dateTime;
  String? location;
  String repeat;
  bool done;

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'dateTime': dateTime?.toIso8601String(),
        'location': location,
        'repeat': repeat,
        'done': done,
      };

  factory Reminder.fromJson(Map<String, dynamic> json) => Reminder(
        id: json['id'] as String,
        title: json['title'] as String,
        dateTime: json['dateTime'] == null ? null : DateTime.parse(json['dateTime'] as String),
        location: json['location'] as String?,
        repeat: json['repeat'] as String? ?? 'None',
        done: json['done'] as bool? ?? false,
      );
}

class ReminderService {
  static final notifications = FlutterLocalNotificationsPlugin();
  static final geo = GeofencingService();

  static const timeDetails = NotificationDetails(
    android: AndroidNotificationDetails(
      'workspace_time',
      'Time reminders',
      channelDescription: 'Workspace Reminder time notifications',
      importance: Importance.max,
      priority: Priority.high,
    ),
  );

  static const locationDetails = NotificationDetails(
    android: AndroidNotificationDetails(
      'workspace_location',
      'Location reminders',
      channelDescription: 'Workspace Reminder location notifications',
      importance: Importance.max,
      priority: Priority.high,
    ),
  );

  static Future<void> init() async {
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    await notifications.initialize(const InitializationSettings(android: android));
    await notifications.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.requestNotificationsPermission();
    await geo.initialize();
    try {
      await geo.requestPermissions();
      await geo.startService(notificationTitle: 'Workspace Reminder', notificationText: 'Location reminders are active');
    } catch (_) {}
    geo.onGeofenceEvent.listen((event) async {
      if (event.type == GeofenceEventType.enter) {
        await notifications.show(
          id: event.regionId.hashCode.abs(),
          title: 'Workspace Reminder',
          body: 'You reached ${event.regionId}',
          notificationDetails: locationDetails,
        );
      }
    });
  }

  static Future<void> schedule(Reminder reminder) async {
    if (reminder.dateTime == null) return;
    final when = tz.TZDateTime.from(reminder.dateTime!, tz.local);
    if (when.isBefore(tz.TZDateTime.now(tz.local))) return;
    if (reminder.repeat == 'Daily') {
      await notifications.zonedSchedule(
        id: reminder.id.hashCode.abs(),
        title: reminder.title,
        body: 'Workspace Reminder',
        scheduledDate: _nextDaily(when),
        notificationDetails: timeDetails,
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
        matchDateTimeComponents: DateTimeComponents.time,
      );
    } else if (reminder.repeat == 'Weekly') {
      await notifications.zonedSchedule(
        id: reminder.id.hashCode.abs(),
        title: reminder.title,
        body: 'Workspace Reminder',
        scheduledDate: when,
        notificationDetails: timeDetails,
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
        matchDateTimeComponents: DateTimeComponents.dayOfWeekAndTime,
      );
    } else {
      await notifications.zonedSchedule(
        id: reminder.id.hashCode.abs(),
        title: reminder.title,
        body: 'Workspace Reminder',
        scheduledDate: when,
        notificationDetails: timeDetails,
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      );
    }
  }

  static tz.TZDateTime _nextDaily(tz.TZDateTime target) {
    final now = tz.TZDateTime.now(tz.local);
    var next = tz.TZDateTime(tz.local, now.year, now.month, now.day, target.hour, target.minute);
    if (next.isBefore(now)) next = next.add(const Duration(days: 1));
    return next;
  }

  static Future<void> cancel(String id) => notifications.cancel(id.hashCode.abs());
}

class WorkspaceReminderApp extends StatelessWidget {
  const WorkspaceReminderApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Workspace Reminder',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo, brightness: Brightness.light),
        darkTheme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo, brightness: Brightness.dark),
        themeMode: ThemeMode.system,
        home: const HomePage(),
      );
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  List<Reminder> reminders = <Reminder>[];
  int tab = 0;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList('reminders') ?? <String>[];
    if (!mounted) return;
    setState(() => reminders = raw.map((e) => Reminder.fromJson(jsonDecode(e) as Map<String, dynamic>)).toList());
  }

  Future<void> save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('reminders', reminders.map((r) => jsonEncode(r.toJson())).toList());
  }

  Future<void> add() async {
    final reminder = await showDialog<Reminder>(context: context, builder: (_) => const AddReminderDialog());
    if (reminder == null) return;
    setState(() => reminders.add(reminder));
    await save();
    await ReminderService.schedule(reminder);
  }

  Future<void> toggle(Reminder reminder) async {
    setState(() => reminder.done = !reminder.done);
    await save();
  }

  Future<void> remove(Reminder reminder) async {
    await ReminderService.cancel(reminder.id);
    setState(() => reminders.remove(reminder));
    await save();
  }

  List<Reminder> get visible {
    final now = DateTime.now();
    if (tab == 1) {
      return reminders.where((r) => !r.done && r.dateTime != null && r.dateTime!.year == now.year && r.dateTime!.month == now.month && r.dateTime!.day == now.day).toList();
    }
    if (tab == 2) {
      return reminders.where((r) => !r.done && (r.dateTime == null || r.dateTime!.isAfter(now))).toList();
    }
    return reminders;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Workspace Reminder', style: TextStyle(fontWeight: FontWeight.w700)),
          actions: [IconButton(onPressed: add, icon: const Icon(Icons.add_task))],
        ),
        body: visible.isEmpty
            ? Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.event_available, size: 64, color: Theme.of(context).colorScheme.primary),
                  const SizedBox(height: 12),
                  const Text('No reminders yet', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  const Text('Add a task with time or location'),
                ]),
              )
            : ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: visible.length,
                itemBuilder: (_, i) {
                  final r = visible[i];
                  return Dismissible(
                    key: ValueKey(r.id),
                    background: Container(color: Colors.red, alignment: Alignment.centerLeft, padding: const EdgeInsets.only(left: 20), child: const Icon(Icons.delete)),
                    direction: DismissDirection.startToEnd,
                    onDismissed: (_) => remove(r),
                    child: Card(
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        leading: Checkbox(value: r.done, onChanged: (_) => toggle(r)),
                        title: Text(r.title, style: TextStyle(fontWeight: FontWeight.w600, decoration: r.done ? TextDecoration.lineThrough : null)),
                        subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          if (r.dateTime != null) Text('🕒 ${DateFormat('dd MMM yyyy, hh:mm a').format(r.dateTime!)}'),
                          if (r.location != null) Text('📍 ${r.location}'),
                        ]),
                        trailing: r.repeat != 'None' ? Text(r.repeat) : null,
                      ),
                    ),
                  );
                },
              ),
        floatingActionButton: FloatingActionButton.extended(onPressed: add, icon: const Icon(Icons.add), label: const Text('Add Reminder')),
        bottomNavigationBar: NavigationBar(
          selectedIndex: tab,
          onDestinationSelected: (v) => setState(() => tab = v),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.list_alt), label: 'All'),
            NavigationDestination(icon: Icon(Icons.today), label: 'Today'),
            NavigationDestination(icon: Icon(Icons.upcoming), label: 'Upcoming'),
          ],
        ),
      );
}

class AddReminderDialog extends StatefulWidget {
  const AddReminderDialog({super.key});
  @override
  State<AddReminderDialog> createState() => _AddReminderDialogState();
}

class _AddReminderDialogState extends State<AddReminderDialog> {
  final title = TextEditingController();
  final location = TextEditingController();
  DateTime? date;
  TimeOfDay? time;
  String repeat = 'None';

  @override
  void dispose() {
    title.dispose();
    location.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('New Reminder'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: title, autofocus: true, decoration: const InputDecoration(labelText: 'What do you need to do?', prefixIcon: Icon(Icons.task_alt))),
            const SizedBox(height: 8),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.calendar_month),
              title: Text(date == null ? 'Date' : DateFormat('dd MMM yyyy').format(date!)),
              onTap: () async {
                final selected = await showDatePicker(context: context, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 3650)), initialDate: date ?? DateTime.now());
                if (selected != null) setState(() => date = selected);
              },
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.schedule),
              title: Text(time == null ? 'Time' : time!.format(context)),
              onTap: () async {
                final selected = await showTimePicker(context: context, initialTime: time ?? TimeOfDay.now());
                if (selected != null) setState(() => time = selected);
              },
            ),
            TextField(controller: location, decoration: const InputDecoration(labelText: 'Location (optional)', prefixIcon: Icon(Icons.location_on))),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: repeat,
              decoration: const InputDecoration(labelText: 'Repeat'),
              items: const ['None', 'Daily', 'Weekly'].map((x) => DropdownMenuItem(value: x, child: Text(x))).toList(),
              onChanged: (x) => setState(() => repeat = x ?? 'None'),
            ),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (title.text.trim().isEmpty) return;
              DateTime? dt;
              if (date != null && time != null) dt = DateTime(date!.year, date!.month, date!.day, time!.hour, time!.minute);
              Navigator.pop(context, Reminder(id: DateTime.now().microsecondsSinceEpoch.toString(), title: title.text.trim(), dateTime: dt, location: location.text.trim().isEmpty ? null : location.text.trim(), repeat: repeat));
            },
            child: const Text('Save'),
          ),
        ],
      );
}
