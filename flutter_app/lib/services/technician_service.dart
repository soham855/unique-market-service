import 'package:supabase_flutter/supabase_flutter.dart';

class TechnicianService {
  final SupabaseClient client;
  TechnicianService(this.client);

  Future<Map<String, dynamic>?> profile() async {
    final user = client.auth.currentUser;
    if (user == null) return null;
    return await client.from('profiles').select().eq('id', user.id).maybeSingle();
  }

  Future<Map<String, dynamic>?> technician() async {
    final p = await profile();
    if (p == null) return null;
    final mobile = p['mobile']?.toString();
    if (mobile == null || mobile.isEmpty) return null;
    return await client.from('technicians').select().eq('mobile', mobile).maybeSingle();
  }

  Future<List<Map<String, dynamic>>> jobs() async {
    final user = client.auth.currentUser;
    if (user == null) return [];
    final rows = await client.from('complaints').select().eq('technician_id', user.id).order('scheduled_visit_at', ascending: true);
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<void> updateStatus(String complaintId, String status) async {
    final user = client.auth.currentUser;
    if (user == null) throw Exception('Technician session expired.');
    final data = <String, dynamic>{'status': status};
    if (status == 'Assigned') data['assigned_at'] = DateTime.now().toUtc().toIso8601String();
    if (status == 'In Service') data['started_at'] = DateTime.now().toUtc().toIso8601String();
    if (status == 'Completed') data['completed_at'] = DateTime.now().toUtc().toIso8601String();
    await client.from('complaints').update(data).eq('id', complaintId).eq('technician_id', user.id);
  }

  Future<void> acceptJob(String complaintId) async {
    final user = client.auth.currentUser;
    if (user == null) throw Exception('Technician session expired.');
    await client.from('complaints').update({
      'technician_id': user.id,
      'status': 'Assigned',
      'assigned_at': DateTime.now().toUtc().toIso8601String(),
    }).eq('id', complaintId);
  }

  Future<void> startVisit(String complaintId, {String? diagnosis}) async {
    final tech = await technician();
    if (tech == null) throw Exception('Technician master record not found.');
    await client.from('service_visits').insert({
      'complaint_id': complaintId,
      'technician_id': tech['id'],
      'started_at': DateTime.now().toUtc().toIso8601String(),
      'diagnosis': diagnosis,
    });
    await updateStatus(complaintId, 'In Service');
  }

  Future<void> completeVisit(String complaintId, {String? workDone, String? partsUsed}) async {
    final tech = await technician();
    if (tech == null) throw Exception('Technician master record not found.');
    final rows = await client.from('service_visits').select('id').eq('complaint_id', complaintId).eq('technician_id', tech['id']).order('created_at', ascending: false).limit(1);
    if (rows.isEmpty) throw Exception('Start the service visit first.');
    await client.from('service_visits').update({
      'completed_at': DateTime.now().toUtc().toIso8601String(),
      'work_done': workDone,
      'parts_used': partsUsed,
    }).eq('id', rows.first['id']);
    await updateStatus(complaintId, 'Completed');
  }
}
