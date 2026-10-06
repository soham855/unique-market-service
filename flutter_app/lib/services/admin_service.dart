import 'package:supabase_flutter/supabase_flutter.dart';

class AdminService {
  final SupabaseClient client;
  AdminService(this.client);

  Future<Map<String,dynamic>?> profile() async {
    final user = client.auth.currentUser;
    if (user == null) return null;
    return await client.from('profiles').select().eq('id', user.id).maybeSingle();
  }

  Future<Map<String,dynamic>> summary() async {
    final complaints = await client.from('complaints').select('id,status');
    final technicians = await client.from('profiles').select('id,full_name,phone,role').eq('role','technician');
    final payments = await client.from('payments').select('amount,payment_status,status');
    int countStatus(String s) => complaints.where((r) => (r['status']?.toString() ?? '') == s).length;
    double collected = 0;
    double pending = 0;
    for (final p in payments) {
      final amount = double.tryParse((p['amount'] ?? 0).toString()) ?? 0;
      final state = (p['payment_status'] ?? p['status'] ?? '').toString().toLowerCase();
      if (state == 'approved' || state == 'paid' || state == 'completed') collected += amount;
      else pending += amount;
    }
    return {
      'total': complaints.length,
      'open': complaints.where((r) => (r['status']?.toString() ?? '') != 'Completed').length,
      'new': countStatus('New'),
      'in_service': countStatus('In Service'),
      'completed': countStatus('Completed'),
      'technicians': technicians.length,
      'collected': collected,
      'pending_payment': pending,
    };
  }

  Future<List<Map<String,dynamic>>> complaints({String? status}) async {
    var q = client.from('complaints').select().order('created_at', ascending: false);
    if (status != null && status != 'All') q = q.eq('status', status);
    final rows = await q;
    return List<Map<String,dynamic>>.from(rows);
  }

  Future<List<Map<String,dynamic>>> technicians() async {
    final rows = await client.from('profiles').select('id,full_name,phone,role').eq('role','technician').order('full_name');
    return List<Map<String,dynamic>>.from(rows);
  }

  Future<void> assignComplaint(String complaintId, String technicianProfileId, DateTime? visitAt, {String? note}) async {
    final data = <String,dynamic>{
      'technician_id': technicianProfileId,
      'status': 'Assigned',
      'assigned_at': DateTime.now().toUtc().toIso8601String(),
      'scheduled_visit_at': visitAt?.toUtc().toIso8601String(),
      'scheduled_visit_date': visitAt == null ? null : visitAt.toIso8601String().substring(0,10),
    };
    if (note != null && note.trim().isNotEmpty) data['resolution_notes'] = note.trim();
    await client.from('complaints').update(data).eq('id', complaintId);
  }

  Future<List<Map<String,dynamic>>> reportComplaints() async {
    final rows = await client.from('complaints').select('id,ticket_no,complaint_no,status,service_type,category,technician_id,created_at,completed_at');
    return List<Map<String,dynamic>>.from(rows);
  }

  Future<List<Map<String,dynamic>>> reportPayments() async {
    final rows = await client.from('payments').select('id,amount,payment_date,payment_status,status,mode,complaint_id,customer_id,created_at');
    return List<Map<String,dynamic>>.from(rows);
  }

  Future<List<Map<String,dynamic>>> reportVisits() async {
    final rows = await client.from('service_visits').select('id,complaint_id,technician_id,started_at,completed_at,created_at');
    return List<Map<String,dynamic>>.from(rows);
  }

  Future<List<Map<String,dynamic>>> reportTechnicians() async {
    final rows = await client.from('technicians').select('id,name,status');
    return List<Map<String,dynamic>>.from(rows);
  }

  Future<List<Map<String,dynamic>>> customers() async {
    final rows = await client.from('customers').select().order('created_at', ascending: false);
    return List<Map<String,dynamic>>.from(rows);
  }

  Future<void> updatePayment(String id, String status) async {
    await client.from('payments').update({'status': status, 'payment_status': status}).eq('id', id);
  }

  Future<List<Map<String,dynamic>>> payments({String? status}) async {
    var q = client.from('payments').select().order('created_at', ascending: false);
    if (status != null && status != 'All') q = q.eq('payment_status', status);
    final rows = await q;
    return List<Map<String,dynamic>>.from(rows);
  }
}
