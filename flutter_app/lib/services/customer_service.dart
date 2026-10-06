import 'package:supabase_flutter/supabase_flutter.dart';

class CustomerService {
  final SupabaseClient client;
  CustomerService(this.client);

  Future<Map<String, dynamic>?> profile() async {
    final user = client.auth.currentUser;
    if (user == null) return null;
    return await client.from('profiles').select().eq('id', user.id).maybeSingle();
  }

  Future<Map<String, dynamic>?> customer() async {
    final user = client.auth.currentUser;
    if (user == null) return null;
    final id = user.id;
    return await client.from('customers')
        .select()
        .or('user_id.eq.' + id + ',profile_id.eq.' + id)
        .maybeSingle();
  }

  Future<List<Map<String, dynamic>>> tickets() async {
    final customer = await this.customer();
    if (customer == null) return [];
    final rows = await client.from('complaints')
        .select()
        .eq('customer_id', customer['id'])
        .order('created_at', ascending: false);
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<Map<String, dynamic>> createComplaint({
    required String category,
    required String serviceType,
    required String description,
    required String address,
    double? latitude,
    double? longitude,
    DateTime? preferredVisit,
  }) async {
    final customer = await this.customer();
    if (customer == null) throw Exception('Customer profile not found');
    final now = DateTime.now().toUtc();
    final payload = <String, dynamic>{
      'customer_id': customer['id'],
      'customer_name': customer['name'],
      'customer_phone': customer['mobile'],
      'company_name': customer['company_name'],
      'category': category,
      'service_type': serviceType,
      'title': serviceType + ' - ' + category,
      'description': description,
      'address': address,
      'location_text': address,
      'latitude': latitude,
      'longitude': longitude,
      'location_captured_at': latitude != null ? now.toIso8601String() : null,
      'scheduled_visit_at': preferredVisit?.toUtc().toIso8601String(),
      'scheduled_visit_date': preferredVisit == null ? null : DateTime(
        preferredVisit.year, preferredVisit.month, preferredVisit.day,
      ).toIso8601String().substring(0, 10),
      'status': 'New',
      'priority': 'Normal',
    };
    final result = await client.from('complaints').insert(payload).select().single();
    return Map<String, dynamic>.from(result);
  }
}
