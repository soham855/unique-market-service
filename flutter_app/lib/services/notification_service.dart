import 'package:supabase_flutter/supabase_flutter.dart';

class NotificationService {
  final SupabaseClient client;
  NotificationService(this.client);

  Future<List<Map<String, dynamic>>> list({int limit = 50}) async {
    final user = client.auth.currentUser;
    if (user == null) return [];
    final rows = await client.from('notifications')
        .select('id,type,title,message,entity_type,entity_id,read_at,created_at')
        .eq('user_id', user.id)
        .order('created_at', ascending: false)
        .limit(limit);
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<void> markRead(String id) async {
    final user = client.auth.currentUser;
    if (user == null) return;
    await client.from('notifications')
        .update({'read_at': DateTime.now().toUtc().toIso8601String()})
        .eq('id', id).eq('user_id', user.id);
  }

  Future<void> markAllRead() async {
    final user = client.auth.currentUser;
    if (user == null) return;
    await client.from('notifications')
        .update({'read_at': DateTime.now().toUtc().toIso8601String()})
        .eq('user_id', user.id).isFilter('read_at', null);
  }
}
