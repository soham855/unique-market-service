import 'dart:typed_data';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:geolocator/geolocator.dart';

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

  Future<Position> currentPosition() async {
    if (!await Geolocator.isLocationServiceEnabled()) throw Exception('Turn on Location/GPS first.');
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) throw Exception('Location permission is required.');
    return Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high));
  }

  Future<double?> verifyCustomerLocation(Map<String, dynamic> job, {double maxMeters = 150}) async {
    final lat = double.tryParse(job['latitude']?.toString() ?? '');
    final lon = double.tryParse(job['longitude']?.toString() ?? '');
    if (lat == null || lon == null) throw Exception('Customer GPS location is not available for this job.');
    final pos = await currentPosition();
    final distance = Geolocator.distanceBetween(pos.latitude, pos.longitude, lat, lon);
    if (distance > maxMeters) throw Exception('You are ' + distance.toStringAsFixed(0) + ' m away. Reach within ' + maxMeters.toStringAsFixed(0) + ' m.');
    return distance;
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
    await client.from('complaints').update({'technician_id': user.id, 'status': 'Assigned', 'assigned_at': DateTime.now().toUtc().toIso8601String()}).eq('id', complaintId);
  }

  Future<Map<String, dynamic>> startVisit(String complaintId, {String? diagnosis}) async {
    final tech = await technician();
    final user = client.auth.currentUser;
    if (tech == null || user == null) throw Exception('Technician record/session not found.');

    final existingVisits = await client.from('service_visits').select('id').eq('complaint_id', complaintId).isFilter('completed_at', null).order('created_at', ascending: false).limit(1);
    final visit = existingVisits.isNotEmpty
        ? Map<String, dynamic>.from(existingVisits.first)
        : Map<String, dynamic>.from(await client.from('service_visits').insert({
      'complaint_id': complaintId,
      'technician_id': tech['id'],
      'started_at': DateTime.now().toUtc().toIso8601String(),
      'diagnosis': diagnosis,
    }).select('id').single());

    final existing = await client.from('service_reports').select().eq('complaint_id', complaintId).eq('technician_id', user.id).order('created_at', ascending: false).limit(1);
    Map<String, dynamic> report;
    if (existing.isNotEmpty) {
      report = Map<String, dynamic>.from(existing.first);
      await client.from('service_reports').update({'service_visit_id': visit['id'], 'diagnosis': diagnosis, 'updated_at': DateTime.now().toUtc().toIso8601String()}).eq('id', report['id']);
    } else {
      final otp = (100000 + DateTime.now().millisecondsSinceEpoch % 900000).toString();
      report = Map<String, dynamic>.from(await client.from('service_reports').insert({
        'complaint_id': complaintId,
        'service_visit_id': visit['id'],
        'technician_id': user.id,
        'diagnosis': diagnosis,
        'customer_otp': otp,
        'customer_otp_verified': false,
      }).select().single());
    }
    await updateStatus(complaintId, 'In Service');
    return report;
  }

  Future<List<Map<String, dynamic>>> completedJobs() async {
    final user = client.auth.currentUser;
    if (user == null) return [];
    final rows = await client.from('complaints').select().eq('technician_id', user.id).eq('status', 'Completed').order('completed_at', ascending: false);
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<List<Map<String, dynamic>>> completedReports() async {
    final user = client.auth.currentUser;
    if (user == null) return [];
    final rows = await client.from('service_reports').select().eq('technician_id', user.id).order('created_at', ascending: false);
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<Map<String, dynamic>?> activeReport(String complaintId) async {
    final user = client.auth.currentUser;
    if (user == null) return null;
    final rows = await client.from('service_reports').select().eq('complaint_id', complaintId).eq('technician_id', user.id).order('created_at', ascending: false).limit(1);
    return rows.isEmpty ? null : Map<String, dynamic>.from(rows.first);
  }

  Future<String> uploadServiceFile(String complaintId, String kind, Uint8List bytes, {String extension = 'jpg'}) async {
    final user = client.auth.currentUser;
    if (user == null) throw Exception('Technician session expired.');
    final path = user.id + '/' + complaintId + '/' + kind + '_' + DateTime.now().millisecondsSinceEpoch.toString() + '.' + extension;
    await client.storage.from('service-files').uploadBinary(path, bytes, fileOptions: const FileOptions(upsert: true));
    return path;
  }

  Future<void> saveBeforePhoto(String reportId, String path) async {
    await client.from('service_reports').update({'before_photo_url': path}).eq('id', reportId);
  }

  Future<void> saveAfterPhoto(String reportId, String path) async {
    await client.from('service_reports').update({'after_photo_url': path}).eq('id', reportId);
  }

  Future<void> verifyCustomerOtp(String reportId, String otp) async {
    final rows = await client.from('service_reports').select('customer_otp').eq('id', reportId).limit(1);
    if (rows.isEmpty) throw Exception('Service report not found.');
    if (rows.first['customer_otp']?.toString() != otp.trim()) throw Exception('Invalid customer OTP.');
    await client.from('service_reports').update({'customer_otp_verified': true, 'customer_approved_at': DateTime.now().toUtc().toIso8601String()}).eq('id', reportId);
  }

  Future<void> saveSignature(String reportId, String path) async {
    await client.from('service_reports').update({'customer_signature': path}).eq('id', reportId);
  }

  Future<void> completeVisit(String complaintId, {String? workDone, String? partsUsed, double labourAmount = 0, double otherAmount = 0}) async {
    final tech = await technician();
    final user = client.auth.currentUser;
    if (tech == null || user == null) throw Exception('Technician record/session not found.');
    final reports = await client.from('service_reports').select().eq('complaint_id', complaintId).eq('technician_id', user.id).order('created_at', ascending: false).limit(1);
    if (reports.isEmpty) throw Exception('Start the service first.');
    final report = Map<String, dynamic>.from(reports.first);
    if (report['customer_otp_verified'] != true) throw Exception('Customer OTP verification is required.');
    if ((report['before_photo_url']?.toString() ?? '').isEmpty) throw Exception('Before-service photo is required.');
    if ((report['after_photo_url']?.toString() ?? '').isEmpty) throw Exception('After-service photo is required.');
    if ((report['customer_signature']?.toString() ?? '').isEmpty) throw Exception('Customer signature is required.');
    final visitId = report['service_visit_id']?.toString();
    if (visitId == null || visitId.isEmpty) throw Exception('Service visit not found.');

    await client.from('service_reports').update({
      'work_summary': workDone,
      'parts_used': partsUsed == null || partsUsed.trim().isEmpty ? [] : [{'description': partsUsed.trim()}],
      'labour_amount': labourAmount,
      'other_amount': otherAmount,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }).eq('id', report['id']);

    await client.from('service_visits').update({'completed_at': DateTime.now().toUtc().toIso8601String(), 'work_done': workDone, 'parts_used': partsUsed}).eq('id', visitId).eq('technician_id', tech['id']);
    await updateStatus(complaintId, 'Completed');
  }
}
