import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'config/supabase_config.dart';
import 'services/auth_service.dart';
import 'services/technician_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SharedPreferences.getInstance();
  if (SupabaseConfig.isConfigured) {
    await Supabase.initialize(url: SupabaseConfig.url, publishableKey: SupabaseConfig.publishableKey);
  }
  runApp(const TechnicianApp());
}

class TechnicianApp extends StatelessWidget {
  const TechnicianApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Unique Market Technician',
    theme: ThemeData(useMaterial3: true, colorSchemeSeed: const Color(0xFF0B63F6), scaffoldBackgroundColor: const Color(0xFFF7F9FC)),
    home: SupabaseConfig.isConfigured ? const TechnicianSessionGate() : const Scaffold(body: Center(child: Text('Supabase is not configured.'))),
  );
}

class TechnicianSessionGate extends StatelessWidget {
  const TechnicianSessionGate({super.key});
  @override
  Widget build(BuildContext context) => Supabase.instance.client.auth.currentSession == null ? const TechnicianLoginPage() : const TechnicianHomePage();
}

class TechnicianLoginPage extends StatefulWidget {
  const TechnicianLoginPage({super.key});
  @override State<TechnicianLoginPage> createState() => _TechnicianLoginPageState();
}
class _TechnicianLoginPageState extends State<TechnicianLoginPage> {
  final mobile = TextEditingController();
  final otp = TextEditingController();
  bool sent = false, busy = false;

  String phone() {
    var p = mobile.text.trim();
    if (p.startsWith('0')) p = '+91' + p.substring(1);
    if (!p.startsWith('+')) p = '+91' + p;
    return p;
  }

  Future<void> send() async {
    setState(() => busy = true);
    try {
      await AuthService(Supabase.instance.client).sendOtp(phone());
      if (mounted) setState(() { sent = true; busy = false; });
    } catch (e) {
      if (mounted) { setState(() => busy = false); ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()))); }
    }
  }

  Future<void> verify() async {
    setState(() => busy = true);
    try {
      final r = await AuthService(Supabase.instance.client).verifyOtp(phone: phone(), token: otp.text);
      if (r.user == null) throw Exception('OTP verification failed.');
      final role = await AuthService(Supabase.instance.client).resolveRole(r.user!.id);
      if (role != 'technician') {
        await Supabase.instance.client.auth.signOut();
        throw Exception('This account is not a Technician account.');
      }
      if (mounted) Navigator.pushAndRemoveUntil(context, MaterialPageRoute(builder: (_) => const TechnicianHomePage()), (_) => false);
    } catch (e) {
      if (mounted) { setState(() => busy = false); ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()))); }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(child: Center(child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 460), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.engineering_outlined, size: 58, color: Color(0xFF0B63F6)),
        const SizedBox(height: 18), const Text('UNIQUE MARKET', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
        const Text('Technician Service Portal'), const SizedBox(height: 36),
        Text(sent ? 'Verify OTP' : 'Technician Login', style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w800)),
        const SizedBox(height: 18),
        if (!sent) TextField(controller: mobile, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Registered Mobile Number', prefixIcon: Icon(Icons.phone_outlined)))
        else TextField(controller: otp, keyboardType: TextInputType.number, maxLength: 6, decoration: const InputDecoration(labelText: 'OTP', prefixIcon: Icon(Icons.lock_outline))),
        const SizedBox(height: 12),
        SizedBox(width: double.infinity, height: 54, child: FilledButton(onPressed: busy ? null : (sent ? verify : send), child: busy ? const CircularProgressIndicator(color: Colors.white) : Text(sent ? 'VERIFY & CONTINUE' : 'SEND OTP'))),
        if (sent) TextButton(onPressed: () => setState(() => sent = false), child: const Text('Change mobile number')),
        const SizedBox(height: 28), const Text('CCTV | IT Security | Service & AMC', style: TextStyle(fontWeight: FontWeight.w700)),
        const Text('Station Road, Hotel Rajdoot, Ichalkaranji\n7350060071', style: TextStyle(color: Colors.black54)),
      ])),
    ))),
  );
}

class TechnicianHomePage extends StatefulWidget {
  const TechnicianHomePage({super.key});
  @override State<TechnicianHomePage> createState() => _TechnicianHomePageState();
}
class _TechnicianHomePageState extends State<TechnicianHomePage> {
  final service = TechnicianService(Supabase.instance.client);
  List<Map<String,dynamic>> jobs = [];
  Map<String,dynamic>? tech;
  bool loading = true;
  int tab = 0;

  @override void initState() { super.initState(); load(); }
  Future<void> load() async {
    try { tech = await service.technician(); jobs = await service.jobs(); } catch (_) {}
    if (mounted) setState(() => loading = false);
  }
  Future<void> logout() async {
    await Supabase.instance.client.auth.signOut();
    if (mounted) Navigator.pushAndRemoveUntil(context, MaterialPageRoute(builder: (_) => const TechnicianLoginPage()), (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final pending = jobs.where((j) => j['status'] != 'Completed').length;
    final completed = jobs.where((j) => j['status'] == 'Completed').length;
    return Scaffold(
      appBar: AppBar(title: const Text('Technician', style: TextStyle(fontWeight: FontWeight.w800)), actions: [
        IconButton(onPressed: load, icon: const Icon(Icons.refresh)),
        PopupMenuButton<String>(onSelected: (v) { if (v == 'logout') logout(); }, itemBuilder: (_) => const [PopupMenuItem(value: 'logout', child: Text('Logout'))])
      ]),
      body: RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(18), children: [
        Text('Namaskar, ' + (tech?['name']?.toString() ?? 'Technician'), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
        Text('Technician ID: ' + (tech?['id']?.toString() ?? '-'), style: const TextStyle(color: Colors.black54)),
        const SizedBox(height: 20),
        Row(children: [
          Expanded(child: _metric('Jobs', jobs.length.toString(), Icons.today_outlined)),
          const SizedBox(width: 10), Expanded(child: _metric('Pending', pending.toString(), Icons.pending_actions_outlined)),
          const SizedBox(width: 10), Expanded(child: _metric('Done', completed.toString(), Icons.check_circle_outline)),
        ]),
        const SizedBox(height: 24), const Text('My Jobs', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)), const SizedBox(height: 10),
        if (loading) const Center(child: CircularProgressIndicator())
        else if (jobs.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No assigned jobs.'))))
        else ...jobs.map((j) => JobCard(job: j, onChanged: load)),
      ])),
      bottomNavigationBar: NavigationBar(selectedIndex: tab, onDestinationSelected: (i) => setState(() => tab = i), destinations: const [
        NavigationDestination(icon: Icon(Icons.dashboard_outlined), label: 'Home'),
        NavigationDestination(icon: Icon(Icons.work_outline), label: 'Jobs'),
        NavigationDestination(icon: Icon(Icons.schedule_outlined), label: 'Schedule'),
        NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
      ]),
    );
  }

  Widget _metric(String title, String value, IconData icon) => Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(children: [Icon(icon, color: const Color(0xFF0B63F6)), const SizedBox(height: 7), Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)), Text(title, style: const TextStyle(color: Colors.black54))])));
}

class JobCard extends StatelessWidget {
  final Map<String,dynamic> job;
  final VoidCallback onChanged;
  const JobCard({super.key, required this.job, required this.onChanged});
  @override
  Widget build(BuildContext context) {
    final status = job['status']?.toString() ?? 'New';
    return Card(margin: const EdgeInsets.only(bottom: 10), child: ListTile(
      leading: const CircleAvatar(child: Icon(Icons.home_repair_service_outlined)),
      title: Text((job['ticket_no'] ?? job['complaint_no'] ?? 'Job').toString(), style: const TextStyle(fontWeight: FontWeight.w800)),
      subtitle: Text((job['customer_name'] ?? 'Customer').toString() + '\n' + (job['service_type'] ?? job['category'] ?? 'Service').toString(), maxLines: 2, overflow: TextOverflow.ellipsis),
      isThreeLine: true, trailing: Chip(label: Text(status)),
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => TechnicianJobDetailsPage(job: job))).then((_) => onChanged()),
    ));
  }
}

class TechnicianJobDetailsPage extends StatefulWidget {
  final Map<String,dynamic> job;
  const TechnicianJobDetailsPage({super.key, required this.job});
  @override State<TechnicianJobDetailsPage> createState() => _TechnicianJobDetailsPageState();
}
class _TechnicianJobDetailsPageState extends State<TechnicianJobDetailsPage> {
  final service = TechnicianService(Supabase.instance.client);
  final diagnosis = TextEditingController();
  final work = TextEditingController();
  final parts = TextEditingController();
  bool busy = false;

  Future<void> action(String status) async {
    setState(() => busy = true);
    try {
      final id = widget.job['id'].toString();
      if (status == 'Assigned') await service.acceptJob(id);
      else if (status == 'On The Way') await service.updateStatus(id, status);
      else if (status == 'Reached') await service.updateStatus(id, status);
      else if (status == 'In Service') await service.startVisit(id, diagnosis: diagnosis.text.trim().isEmpty ? null : diagnosis.text.trim());
      else if (status == 'Completed') await service.completeVisit(id, workDone: work.text.trim().isEmpty ? null : work.text.trim(), partsUsed: parts.text.trim().isEmpty ? null : parts.text.trim());
      if (mounted) { ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Status updated: ' + status))); Navigator.pop(context); }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally { if (mounted) setState(() => busy = false); }
  }

  @override
  Widget build(BuildContext context) {
    final j = widget.job; final status = j['status']?.toString() ?? 'New';
    return Scaffold(appBar: AppBar(title: const Text('Job Details')), body: ListView(padding: const EdgeInsets.all(18), children: [
      Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text((j['ticket_no'] ?? j['complaint_no'] ?? 'Job').toString(), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
        const SizedBox(height: 10), _row('Customer', j['customer_name']), _row('Mobile', j['customer_phone']), _row('Service', j['service_type']), _row('Problem', j['category']), _row('Address', j['address'] ?? j['location_text']), _row('Visit', j['scheduled_visit_at'] ?? j['scheduled_visit_date']),
      ]))),
      const SizedBox(height: 12),
      if (status == 'New') _button('ACCEPT JOB', Icons.check, 'Assigned')
      else if (status == 'Assigned' || status == 'Scheduled') _button("I'M ON THE WAY", Icons.navigation_outlined, 'On The Way')
      else if (status == 'On The Way') _button('REACHED CUSTOMER', Icons.location_on_outlined, 'Reached')
      else if (status == 'Reached') ...[
        TextField(controller: diagnosis, maxLines: 3, decoration: const InputDecoration(labelText: 'Diagnosis')),
        const SizedBox(height: 12), _button('START SERVICE', Icons.play_arrow_outlined, 'In Service')
      ] else if (status == 'In Service') ...[
        TextField(controller: work, maxLines: 4, decoration: const InputDecoration(labelText: 'Work Done')),
        const SizedBox(height: 12), TextField(controller: parts, maxLines: 3, decoration: const InputDecoration(labelText: 'Parts Used')),
        const SizedBox(height: 12), _button('COMPLETE SERVICE', Icons.check_circle_outline, 'Completed')
      ] else const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('This job is completed.'))),
    ]));
  }

  Widget _button(String label, IconData icon, String status) => SizedBox(height: 54, child: FilledButton.icon(onPressed: busy ? null : () => action(status), icon: Icon(icon), label: Text(label)));
  Widget _row(String label, dynamic value) => Padding(padding: const EdgeInsets.only(bottom: 10), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [SizedBox(width: 95, child: Text(label, style: const TextStyle(color: Colors.black54))), Expanded(child: Text(value?.toString() ?? '-', style: const TextStyle(fontWeight: FontWeight.w600)))]));
}
