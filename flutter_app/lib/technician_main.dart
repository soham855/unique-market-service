import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:image_picker/image_picker.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
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
      bottomNavigationBar: NavigationBar(selectedIndex: tab, onDestinationSelected: (i) async {
        if (i == 0) { setState(() => tab = 0); return; }
        if (i == 1) {
          setState(() => tab = 1);
          await Navigator.push(context, MaterialPageRoute(builder: (_) => TechnicianHistoryPage(service: service)));
          if (mounted) { setState(() => tab = 0); load(); }
          return;
        }
        if (i == 2) {
          setState(() => tab = 2);
          await Navigator.push(context, MaterialPageRoute(builder: (_) => TechnicianSchedulePage(service: service)));
          if (mounted) { setState(() => tab = 0); load(); }
          return;
        }
        if (i == 3) {
          setState(() => tab = 3);
          await Navigator.push(context, MaterialPageRoute(builder: (_) => TechnicianProfilePage(technician: tech, onLogout: logout)));
          if (mounted) { setState(() => tab = 0); load(); }
        }
      }, destinations: const [
        NavigationDestination(icon: Icon(Icons.dashboard_outlined), label: 'Home'),
        NavigationDestination(icon: Icon(Icons.work_outline), label: 'Jobs'),
        NavigationDestination(icon: Icon(Icons.schedule_outlined), label: 'Schedule'),
        NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
      ]),
    );
  }
  Widget _metric(String title, String value, IconData icon) => Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(children: [Icon(icon, color: const Color(0xFF0B63F6)), const SizedBox(height: 7), Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)), Text(title, style: const TextStyle(color: Colors.black54))])));
}


class TechnicianHistoryPage extends StatefulWidget {
  final TechnicianService service;
  const TechnicianHistoryPage({super.key, required this.service});
  @override State<TechnicianHistoryPage> createState() => _TechnicianHistoryPageState();
}
class _TechnicianHistoryPageState extends State<TechnicianHistoryPage> {
  List<Map<String,dynamic>> jobs = [];
  List<Map<String,dynamic>> reports = [];
  bool loading = true;
  double earnings = 0;
  @override void initState(){super.initState(); load();}
  Future<void> load() async {
    try {
      jobs = await widget.service.completedJobs();
      reports = await widget.service.completedReports();
      earnings = 0;
      for (final r in reports) {
        earnings += (num.tryParse(r['labour_amount']?.toString() ?? '') ?? 0).toDouble();
        earnings += (num.tryParse(r['other_amount']?.toString() ?? '') ?? 0).toDouble();
      }
    } catch (_) {}
    if(mounted)setState(()=>loading=false);
  }
  Map<String,dynamic>? reportFor(String id) {
    for(final r in reports){ if(r['complaint_id']?.toString()==id) return r; }
    return null;
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar: AppBar(title:const Text('Job History & Earnings'),actions:[IconButton(onPressed:load,icon:const Icon(Icons.refresh))]),
    body: loading ? const Center(child:CircularProgressIndicator()) : RefreshIndicator(
      onRefresh:load, child:ListView(padding:const EdgeInsets.all(16),children:[
        Card(child:Padding(padding:const EdgeInsets.all(18),child:Row(children:[
          const CircleAvatar(radius:26,child:Icon(Icons.currency_rupee)),
          const SizedBox(width:14), Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            const Text('Service Earnings',style:TextStyle(color:Colors.black54)),
            Text('₹${earnings.toStringAsFixed(2)}',style:const TextStyle(fontSize:28,fontWeight:FontWeight.w900)),
          ])),
          Column(children:[Text('${jobs.length}',style:const TextStyle(fontSize:22,fontWeight:FontWeight.w900)),const Text('Completed',style:TextStyle(color:Colors.black54))])
        ]))),
        const SizedBox(height:12),
        const Text('Completed Jobs',style:TextStyle(fontSize:20,fontWeight:FontWeight.w800)),
        const SizedBox(height:8),
        if(jobs.isEmpty) const Card(child:Padding(padding:EdgeInsets.all(24),child:Center(child:Text('No completed jobs yet.')))),
        ...jobs.map((j){
          final r=reportFor(j['id'].toString());
          final total=(num.tryParse(r?['labour_amount']?.toString()??'')??0)+(num.tryParse(r?['other_amount']?.toString()??'')??0);
          return Card(child:ListTile(
            leading:const CircleAvatar(child:Icon(Icons.check_circle_outline)),
            title:Text((j['ticket_no']??j['complaint_no']??'Completed Job').toString(),style:const TextStyle(fontWeight:FontWeight.w800)),
            subtitle:Text('${j['customer_name']??'Customer'}\n${j['completed_at']??'-'}',maxLines:2),
            trailing:Text('₹${total.toStringAsFixed(0)}',style:const TextStyle(fontWeight:FontWeight.w800)),
            onTap:r==null?null:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>TechnicianServiceReportPage(job:j,report:r))),
          ));
        }),
      ])
    ),
  );
}

class TechnicianServiceReportPage extends StatelessWidget {
  final Map<String,dynamic> job;
  final Map<String,dynamic> report;
  const TechnicianServiceReportPage({super.key,required this.job,required this.report});

  Future<void> exportPdf(BuildContext context) async {
    final doc=pw.Document();
    final ticket=(job['ticket_no']??job['complaint_no']??'Service Report').toString();
    final labour=(num.tryParse(report['labour_amount']?.toString()??'')??0).toDouble();
    final other=(num.tryParse(report['other_amount']?.toString()??'')??0).toDouble();
    final total=labour+other;
    doc.addPage(pw.Page(build:(_)=>pw.Column(crossAxisAlignment:pw.CrossAxisAlignment.start,children:[
      pw.Text('UNIQUE MARKET',style:pw.TextStyle(fontSize:24,fontWeight:pw.FontWeight.bold)),
      pw.Text('CCTV | IT Security | Service & AMC'),
      pw.SizedBox(height:18),
      pw.Text('COMPLETED SERVICE REPORT',style:pw.TextStyle(fontSize:18,fontWeight:pw.FontWeight.bold)),
      pw.Divider(),
      pw.Text('Ticket: $ticket'),
      pw.Text('Customer: ${job['customer_name']??'-'}'),
      pw.Text('Mobile: ${job['customer_phone']??'-'}'),
      pw.Text('Address: ${job['address']??job['location_text']??'-'}'),
      pw.Text('Service: ${job['service_type']??job['category']??'-'}'),
      pw.Text('Completed: ${job['completed_at']??'-'}'),
      pw.SizedBox(height:14),
      pw.Text('Diagnosis: ${report['diagnosis']??'-'}'),
      pw.Text('Work Done: ${report['work_summary']??'-'}'),
      pw.Text('Parts Used: ${report['parts_used']??'-'}'),
      pw.SizedBox(height:10),
      pw.Text('Labour: ₹${labour.toStringAsFixed(2)}'),
      pw.Text('Other: ₹${other.toStringAsFixed(2)}'),
      pw.Text('Total Service Charges: ₹${total.toStringAsFixed(2)}',style:pw.TextStyle(fontWeight:pw.FontWeight.bold)),
      pw.SizedBox(height:20),
      pw.Text('Customer Approval: ${report['customer_otp_verified']==true?'OTP Verified':'Not Verified'}'),
      pw.SizedBox(height:30),
      pw.Text('Station Road, Hotel Rajdoot, Ichalkaranji'),
      pw.Text('7350060071'),
    ])));
    await Printing.layoutPdf(onLayout:(_)=>doc.save());
  }
  @override Widget build(BuildContext context){
    final total=(num.tryParse(report['labour_amount']?.toString()??'')??0)+(num.tryParse(report['other_amount']?.toString()??'')??0);
    return Scaffold(appBar:AppBar(title:const Text('Service Report')),body:ListView(padding:const EdgeInsets.all(18),children:[
      Card(child:Padding(padding:const EdgeInsets.all(18),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text((job['ticket_no']??job['complaint_no']??'Report').toString(),style:const TextStyle(fontSize:24,fontWeight:FontWeight.w900)),
        const SizedBox(height:10),
        Text('Customer: ${job['customer_name']??'-'}'),
        Text('Completed: ${job['completed_at']??'-'}'),
        const Divider(height:24),
        Text('Diagnosis: ${report['diagnosis']??'-'}'),
        const SizedBox(height:8),
        Text('Work Done: ${report['work_summary']??'-'}'),
        const SizedBox(height:8),
        Text('Parts Used: ${report['parts_used']??'-'}'),
        const Divider(height:24),
        Text('Labour: ₹${(num.tryParse(report['labour_amount']?.toString()??'')??0).toStringAsFixed(2)}'),
        Text('Other: ₹${(num.tryParse(report['other_amount']?.toString()??'')??0).toStringAsFixed(2)}'),
        const SizedBox(height:6),
        Text('Total: ₹${total.toStringAsFixed(2)}',style:const TextStyle(fontSize:20,fontWeight:FontWeight.w900)),
      ]))),
      const SizedBox(height:12),
      SizedBox(height:52,child:FilledButton.icon(onPressed:()=>exportPdf(context),icon:const Icon(Icons.picture_as_pdf),label:const Text('VIEW / SHARE PDF REPORT'))),
    ]));
  }
}

class TechnicianSchedulePage extends StatefulWidget {
  final TechnicianService service;
  const TechnicianSchedulePage({super.key,required this.service});
  @override State<TechnicianSchedulePage> createState()=>_TechnicianSchedulePageState();
}
class _TechnicianSchedulePageState extends State<TechnicianSchedulePage>{
  List<Map<String,dynamic>> jobs=[]; bool loading=true;
  @override void initState(){super.initState();load();}
  Future<void>load()async{try{final all=await widget.service.jobs();all.sort((a,b){
    final ad=DateTime.tryParse(a['scheduled_visit_at']?.toString()??'')??DateTime(2099);
    final bd=DateTime.tryParse(b['scheduled_visit_at']?.toString()??'')??DateTime(2099);
    return ad.compareTo(bd);
  });if(mounted)setState(()=>{jobs=all;loading=false;});}catch(_){if(mounted)setState(()=>loading=false);}}
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Schedule'),actions:[IconButton(onPressed:load,icon:const Icon(Icons.refresh))]),body:loading?const Center(child:CircularProgressIndicator()):RefreshIndicator(onRefresh:load,child:ListView(padding:const EdgeInsets.all(14),children:[
    if(jobs.isEmpty)const Card(child:Padding(padding:EdgeInsets.all(24),child:Text('No scheduled visits.'))),
    ...jobs.map((j)=>Card(child:ListTile(
      leading:const CircleAvatar(child:Icon(Icons.event_outlined)),
      title:Text((j['ticket_no']??j['complaint_no']??'Job').toString(),style:const TextStyle(fontWeight:FontWeight.w800)),
      subtitle:Text((j['scheduled_visit_at']??j['scheduled_visit_date']??'Schedule not set').toString()+'\n'+(j['customer_name']??'Customer').toString(),maxLines:2),
      trailing:Chip(label:Text((j['status']??'New').toString())),
      onTap:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>TechnicianJobDetailsPage(job:j))),
    )))
  ])));
}

class TechnicianProfilePage extends StatelessWidget{
  final Map<String,dynamic>? technician;
  final Future<void> Function() onLogout;
  const TechnicianProfilePage({super.key,required this.technician,required this.onLogout});
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Technician Profile')),body:ListView(padding:const EdgeInsets.all(18),children:[
    Card(child:Padding(padding:const EdgeInsets.all(20),child:Column(children:[
      const CircleAvatar(radius:42,child:Icon(Icons.engineering_outlined,size:42)),
      const SizedBox(height:12),
      Text((technician?['name']??'Technician').toString(),style:const TextStyle(fontSize:24,fontWeight:FontWeight.w900)),
      Text('Technician ID: '+(technician?['id']??'-').toString(),style:const TextStyle(color:Colors.black54)),
      const SizedBox(height:16),
      ListTile(leading:const Icon(Icons.phone_outlined),title:Text((technician?['mobile']??'-').toString())),
      ListTile(leading:const Icon(Icons.verified_user_outlined),title:Text('Status: '+(technician?['status']??'Active').toString())),
    ]))),
    const SizedBox(height:12),
    Card(child:Column(children:[
      ListTile(leading:const Icon(Icons.business_outlined),title:const Text('UNIQUE MARKET'),subtitle:const Text('CCTV | IT Security | Service & AMC')),
      const ListTile(leading:Icon(Icons.location_on_outlined),title:Text('Station Road, Hotel Rajdoot, Ichalkaranji')),
      const ListTile(leading:Icon(Icons.phone),title:Text('7350060071')),
    ])),
    const SizedBox(height:12),
    OutlinedButton.icon(onPressed:()=>onLogout(),icon:const Icon(Icons.logout),label:const Text('LOGOUT')),
  ]));
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
  final picker = ImagePicker();
  final diagnosis = TextEditingController();
  final work = TextEditingController();
  final parts = TextEditingController();
  final otp = TextEditingController();
  final labour = TextEditingController(text: '0');
  final other = TextEditingController(text: '0');
  bool busy = false;
  double? distanceMeters;
  Map<String,dynamic>? report;

  @override
  void initState() {
    super.initState();
    _loadReport();
  }

  Future<void> _loadReport() async {
    try {
      report = await service.activeReport(widget.job['id'].toString());
      if (mounted) setState(() {});
    } catch (_) {}
  }

  Future<void> openNavigation() async {
    final lat = widget.job['latitude']?.toString();
    final lon = widget.job['longitude']?.toString();
    final address = widget.job['address']?.toString() ?? widget.job['location_text']?.toString() ?? '';
    final uri = (lat != null && lon != null && lat.isNotEmpty && lon.isNotEmpty)
        ? Uri.parse('https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lon)
        : Uri.parse('https://www.google.com/maps/search/?api=1&query=' + Uri.encodeComponent(address));
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open Maps.')));
  }

  Future<void> verifyReached() async {
    setState(() => busy = true);
    try {
      final d = await service.verifyCustomerLocation(widget.job);
      if (mounted) setState(() => distanceMeters = d);
      await action('Reached');
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> action(String status) async {
    setState(() => busy = true);
    try {
      final id = widget.job['id'].toString();
      if (status == 'Assigned') await service.acceptJob(id);
      else if (status == 'On The Way') await service.updateStatus(id, status);
      else if (status == 'Reached') await service.updateStatus(id, status);
      else if (status == 'In Service') {
        report = await service.startVisit(id, diagnosis: diagnosis.text.trim().isEmpty ? null : diagnosis.text.trim());
      }
      if (mounted) { ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Status updated: ' + status))); if (status != 'In Service') Navigator.pop(context); else setState(() {}); }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> capturePhoto(String kind) async {
    if (report == null) { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Start service first.'))); return; }
    setState(() => busy = true);
    try {
      final image = await picker.pickImage(source: ImageSource.camera, imageQuality: 82, maxWidth: 1600);
      if (image == null) return;
      final bytes = await image.readAsBytes();
      final path = await service.uploadServiceFile(widget.job['id'].toString(), kind, bytes);
      if (kind == 'before') await service.saveBeforePhoto(report!['id'].toString(), path);
      else await service.saveAfterPhoto(report!['id'].toString(), path);
      await _loadReport();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(kind == 'before' ? 'Before photo saved.' : 'After photo saved.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> verifyOtp() async {
    if (report == null) return;
    setState(() => busy = true);
    try {
      await service.verifyCustomerOtp(report!['id'].toString(), otp.text);
      await _loadReport();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Customer OTP verified.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> captureSignature() async {
    if (report == null) return;
    final bytes = await showDialog<Uint8List>(context: context, builder: (_) => const SignatureDialog());
    if (bytes == null) return;
    setState(() => busy = true);
    try {
      final path = await service.uploadServiceFile(widget.job['id'].toString(), 'signature', bytes, extension: 'png');
      await service.saveSignature(report!['id'].toString(), path);
      await _loadReport();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Customer signature saved.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> complete() async {
    setState(() => busy = true);
    try {
      await service.completeVisit(widget.job['id'].toString(),
        workDone: work.text.trim().isEmpty ? null : work.text.trim(),
        partsUsed: parts.text.trim().isEmpty ? null : parts.text.trim(),
        labourAmount: double.tryParse(labour.text.trim()) ?? 0,
        otherAmount: double.tryParse(other.text.trim()) ?? 0,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Service completed successfully.')));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally { if (mounted) setState(() => busy = false); }
  }

  @override
  Widget build(BuildContext context) {
    final j = widget.job; final status = j['status']?.toString() ?? 'New';
    final before = (report?['before_photo_url']?.toString() ?? '').isNotEmpty;
    final after = (report?['after_photo_url']?.toString() ?? '').isNotEmpty;
    final signed = (report?['customer_signature']?.toString() ?? '').isNotEmpty;
    final otpOk = report?['customer_otp_verified'] == true;
    return Scaffold(
      appBar: AppBar(title: const Text('Job Details')),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text((j['ticket_no'] ?? j['complaint_no'] ?? 'Job').toString(), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          _row('Customer', j['customer_name']), _row('Mobile', j['customer_phone']), _row('Service', j['service_type']), _row('Problem', j['category']), _row('Address', j['address'] ?? j['location_text']), _row('Visit', j['scheduled_visit_at'] ?? j['scheduled_visit_date']),
        ]))),
        const SizedBox(height: 12),
        if (distanceMeters != null) Card(child: ListTile(leading: const Icon(Icons.gps_fixed), title: const Text('GPS Verified'), subtitle: Text(distanceMeters!.toStringAsFixed(0) + ' m from customer location'))),
        if (status == 'New') _button('ACCEPT JOB', Icons.check, 'Assigned')
        else if (status == 'Assigned' || status == 'Scheduled') _button("I'M ON THE WAY", Icons.navigation_outlined, 'On The Way')
        else if (status == 'On The Way') ...[
          OutlinedButton.icon(onPressed: busy ? null : openNavigation, icon: const Icon(Icons.map_outlined), label: const Text('NAVIGATE TO CUSTOMER')),
          const SizedBox(height: 10), _button('VERIFY LOCATION & REACH', Icons.location_on_outlined, 'Reached')
        ] else if (status == 'Reached') ...[
          TextField(controller: diagnosis, maxLines: 3, decoration: const InputDecoration(labelText: 'Diagnosis', border: OutlineInputBorder())),
          const SizedBox(height: 12), _button('START SERVICE', Icons.play_arrow_outlined, 'In Service')
        ] else if (status == 'In Service') ...[
          _checkCard('Before Service Photo', before, () => capturePhoto('before')),
          _checkCard('After Service Photo', after, () => capturePhoto('after')),
          Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Work & Charges', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            TextField(controller: work, maxLines: 3, decoration: const InputDecoration(labelText: 'Work Done', border: OutlineInputBorder())),
            const SizedBox(height: 10),
            TextField(controller: parts, maxLines: 2, decoration: const InputDecoration(labelText: 'Parts Used', border: OutlineInputBorder())),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: TextField(controller: labour, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Labour ₹', border: OutlineInputBorder()))),
              const SizedBox(width: 10),
              Expanded(child: TextField(controller: other, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Other ₹', border: OutlineInputBorder()))),
            ]),
          ])),
          Card(child: ListTile(leading: Icon(otpOk ? Icons.verified : Icons.pin_outlined), title: Text(otpOk ? 'Customer OTP Verified' : 'Customer OTP Verification'), subtitle: Text(otpOk ? 'Customer approved service completion.' : 'Ask the customer for the OTP shown in their Customer App.'), trailing: otpOk ? const Icon(Icons.check_circle) : null)),
          if (!otpOk) Row(children: [
            Expanded(child: TextField(controller: otp, keyboardType: TextInputType.number, maxLength: 6, decoration: const InputDecoration(labelText: 'Customer OTP', border: OutlineInputBorder()))),
            const SizedBox(width: 8), FilledButton(onPressed: busy ? null : verifyOtp, child: const Text('VERIFY')),
          ]),
          _checkCard('Customer Digital Signature', signed, captureSignature),
          const SizedBox(height: 8),
          SizedBox(height: 54, child: FilledButton.icon(onPressed: busy ? null : complete, icon: const Icon(Icons.check_circle_outline), label: const Text('COMPLETE SERVICE'))),
        ] else const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('This job is completed.'))),
        const SizedBox(height: 20),
        const Center(child: Text('UNIQUE MARKET • 7350060071', style: TextStyle(color: Colors.black45))),
      ]),
    );
  }

  Widget _checkCard(String title, bool done, VoidCallback action) => Card(child: ListTile(
    leading: Icon(done ? Icons.check_circle : Icons.camera_alt_outlined, color: done ? Colors.green : null),
    title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
    subtitle: Text(done ? 'Saved' : 'Required before completion'),
    trailing: done ? const Icon(Icons.verified) : FilledButton(onPressed: busy ? null : action, child: const Text('ADD')),
  ));

  Widget _button(String label, IconData icon, String status) => SizedBox(height: 54, child: FilledButton.icon(onPressed: busy ? null : (status == 'Reached' ? verifyReached : () => action(status)), icon: Icon(icon), label: Text(label)));
  Widget _row(String label, dynamic value) => Padding(padding: const EdgeInsets.only(bottom: 10), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [SizedBox(width: 95, child: Text(label, style: const TextStyle(color: Colors.black54))), Expanded(child: Text(value?.toString() ?? '-', style: const TextStyle(fontWeight: FontWeight.w600)))]));
}

class SignatureDialog extends StatefulWidget {
  const SignatureDialog({super.key});
  @override State<SignatureDialog> createState() => _SignatureDialogState();
}
class _SignatureDialogState extends State<SignatureDialog> {
  final points = <Offset?>[];
  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Customer Digital Signature'),
    content: SizedBox(width: 420, height: 230, child: DecoratedBox(
      decoration: BoxDecoration(border: Border.all(color: Colors.black26), borderRadius: BorderRadius.circular(12)),
      child: GestureDetector(
        onPanStart: (d) => setState(() => points.add(d.localPosition)),
        onPanUpdate: (d) => setState(() => points.add(d.localPosition)),
        onPanEnd: (_) => setState(() => points.add(null)),
        child: CustomPaint(painter: SignaturePainter(points), child: const SizedBox.expand()),
      ),
    )),
    actions: [
      TextButton(onPressed: () => setState(points.clear), child: const Text('CLEAR')),
      FilledButton(onPressed: points.whereType<Offset>().isEmpty ? null : () async {
        final data = await _renderSignature();
        if (context.mounted) Navigator.pop(context, data);
      }, child: const Text('SAVE SIGNATURE')),
    ],
  );
  Future<Uint8List> _renderSignature() async {
    const size = Size(900, 500);
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawRect(Offset.zero & size, Paint()..color = Colors.white);
    final paint = Paint()..color = Colors.black..strokeWidth = 5..strokeCap = StrokeCap.round..style = PaintingStyle.stroke;
    Offset? previous;
    for (final p in points) {
      if (p == null) { previous = null; continue; }
      final scaled = Offset(p.dx * 900 / 420, p.dy * 500 / 230);
      if (previous != null) canvas.drawLine(previous!, scaled, paint);
      previous = scaled;
    }
    final image = await recorder.endRecording().toImage(900, 500);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    return bytes!.buffer.asUint8List();
  }
}
class SignaturePainter extends CustomPainter {
  final List<Offset?> points;
  SignaturePainter(this.points);
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.black..strokeWidth = 3..strokeCap = StrokeCap.round..style = PaintingStyle.stroke;
    Offset? previous;
    for (final p in points) {
      if (p == null) { previous = null; continue; }
      if (previous != null) canvas.drawLine(previous!, p, paint);
      previous = p;
    }
  }
  @override bool shouldRepaint(covariant SignaturePainter oldDelegate) => oldDelegate.points != points;
}
