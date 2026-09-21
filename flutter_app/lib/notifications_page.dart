import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'services/notification_service.dart';
import 'app_localizations.dart';

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key});
  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  late final NotificationService service;
  List<Map<String, dynamic>> items = [];
  bool loading = true;
  String? error;
  RealtimeChannel? channel;

  @override
  void initState() {
    super.initState();
    service = NotificationService(Supabase.instance.client);
    load();
    final user = Supabase.instance.client.auth.currentUser;
    if (user != null) {
      channel = Supabase.instance.client.channel('mobile-notifications-' + user.id)
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'notifications',
          filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'user_id', value: user.id),
          callback: (_) => load(),
        ).subscribe();
    }
  }

  Future<void> load() async {
    try {
      final next = await service.list();
      if (mounted) setState(() { items = next; loading = false; error = null; });
    } catch (e) {
      if (mounted) setState(() { loading = false; error = e.toString(); });
    }
  }

  Future<void> read(String id) async { await service.markRead(id); await load(); }
  Future<void> readAll() async { await service.markAllRead(); await load(); }

  @override
  void dispose() {
    if (channel != null) Supabase.instance.client.removeChannel(channel!);
    super.dispose();
  }

  IconData iconFor(String type) {
    if (type.contains('payment')) return Icons.payments_outlined;
    if (type.contains('assigned') || type.contains('complaint') || type.contains('request')) return Icons.confirmation_number_outlined;
    return Icons.notifications_active_outlined;
  }

  @override
  Widget build(BuildContext context) {
    final unread = items.where((x) => x['read_at'] == null).length;
    return Scaffold(
      appBar: AppBar(
        title: Text(tr(context, 'Notifications'), style: const TextStyle(fontWeight: FontWeight.w800)),
        actions: [if (unread > 0) TextButton(onPressed: readAll, child: Text(tr(context, 'Read all')))],
      ),
      body: loading ? const Center(child: CircularProgressIndicator()) : RefreshIndicator(
        onRefresh: load,
        child: error != null
          ? ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text(error!))])
          : items.isEmpty
            ? ListView(children: [Padding(padding: const EdgeInsets.all(40), child: Center(child: Text(tr(context, 'No notifications yet.'))))])
            : ListView.separated(
                padding: const EdgeInsets.all(14),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, index) {
                  final n = items[index];
                  final unreadItem = n['read_at'] == null;
                  final message = (n['message'] ?? '').toString();
                  final created = (n['created_at'] ?? '').toString();
                  return Card(
                    color: unreadItem ? const Color(0xFF102A38) : const Color(0xFF0D131C),
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor: const Color(0xFF12313B),
                        child: Icon(iconFor((n['type'] ?? '').toString()), color: const Color(0xFF67E8F9)),
                      ),
                      title: Text((n['title'] ?? 'Service update').toString(), style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Padding(padding: const EdgeInsets.only(top: 5), child: Text(message + '\n' + created, style: const TextStyle(color: Colors.white60))),
                      isThreeLine: true,
                      trailing: unreadItem
                        ? IconButton(tooltip: tr(context, 'Mark as read'), onPressed: () => read(n['id'].toString()), icon: const Icon(Icons.done))
                        : const Icon(Icons.check_circle_outline, color: Colors.white24),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
