import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:geolocator/geolocator.dart';
import 'config/supabase_config.dart';
import 'services/auth_service.dart';
import 'services/customer_service.dart';
import 'services/push_notification_service.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:url_launcher/url_launcher.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SharedPreferences.getInstance();
  if (SupabaseConfig.isConfigured) {
    await Supabase.initialize(url: SupabaseConfig.url, publishableKey: SupabaseConfig.publishableKey);
  }
  runApp(const UniqueMarketApp());
}

class UniqueMarketApp extends StatelessWidget {
  const UniqueMarketApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Unique Market',
    theme: ThemeData(useMaterial3: true, colorSchemeSeed: const Color(0xFF0B63F6), scaffoldBackgroundColor: const Color(0xFFF7F9FC)),
    home: SupabaseConfig.isConfigured ? const SessionGate() : const Scaffold(body: Center(child: Text('Supabase is not configured.'))),
  );
}

class SessionGate extends StatefulWidget {
  const SessionGate({super.key});
  @override State<SessionGate> createState()=>_SessionGateState();
}
class _SessionGateState extends State<SessionGate>{
  bool loading=true, allowed=false;
  @override void initState(){super.initState();check();}
  Future<void> check()async{
    final session=Supabase.instance.client.auth.currentSession;
    if(session==null){if(mounted)setState(()=>loading=false);return;}
    final prefs=await SharedPreferences.getInstance();
    final remember=prefs.getBool('remember_me')??true;
    final until=prefs.getInt('remember_until_ms');
    if(!remember || (until!=null && DateTime.now().millisecondsSinceEpoch>until)){
      await Supabase.instance.client.auth.signOut();
      await prefs.remove('remember_until_ms');
      if(mounted)setState(()=>loading=false);
      return;
    }
    if(mounted)setState((){allowed=true;loading=false;});
  }
  @override Widget build(BuildContext context){
    if(loading)return const Scaffold(body:Center(child:CircularProgressIndicator()));
    return allowed?const CustomerHomePage():const LoginPage();
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override State<LoginPage> createState() => _LoginPageState();
}
class _LoginPageState extends State<LoginPage> {
  final phone = TextEditingController();
  final otp = TextEditingController();
  bool sent = false, busy = false, remember = true;

  String normalizedPhone() {
    var p = phone.text.trim();
    if (p.startsWith('0')) p = '+91' + p.substring(1);
    if (!p.startsWith('+')) p = '+91' + p;
    return p;
  }

  Future<void> send() async {
    setState(() => busy = true);
    try {
      await AuthService(Supabase.instance.client).sendOtp(normalizedPhone());
      setState(() { sent = true; busy = false; });
    } catch (e) {
      setState(() => busy = false);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> verify() async {
    setState(() => busy = true);
    try {
      final r = await AuthService(Supabase.instance.client).verifyOtp(phone: normalizedPhone(), token: otp.text);
      if (r.user == null) throw Exception('OTP verification failed');
      final role = await AuthService(Supabase.instance.client).resolveRole(r.user!.id);
      if (role != 'customer') {
        await Supabase.instance.client.auth.signOut();
        throw Exception('This account is not a Customer account.');
      }
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('remember_me', remember);
      if (remember) {
        await prefs.setInt('remember_until_ms', DateTime.now().add(const Duration(days: 15)).millisecondsSinceEpoch);
      } else {
        await prefs.remove('remember_until_ms');
      }
      if (mounted) Navigator.pushAndRemoveUntil(context, MaterialPageRoute(builder: (_) => const CustomerHomePage()), (_) => false);
    } catch (e) {
      setState(() => busy = false);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(child: Center(child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 460), child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.shield_outlined, size: 58, color: Color(0xFF0B63F6)),
          const SizedBox(height: 18),
          const Text('UNIQUE MARKET', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
          const SizedBox(height: 6),
          const Text('Instant Services for Your Security'),
          const SizedBox(height: 36),
          Text(sent ? 'Verify OTP' : 'Customer Login', style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w800)),
          const SizedBox(height: 18),
          if (!sent) ...[
            TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Mobile Number', prefixIcon: Icon(Icons.phone_outlined))),
            CheckboxListTile(value: remember, onChanged: (v) => setState(() => remember = v ?? true), contentPadding: EdgeInsets.zero, title: const Text('Remember Me'), subtitle: const Text('Stay signed in for 15 days')),
          ] else
            TextField(controller: otp, keyboardType: TextInputType.number, maxLength: 6, decoration: const InputDecoration(labelText: 'OTP', prefixIcon: Icon(Icons.lock_outline))),
          const SizedBox(height: 12),
          SizedBox(width: double.infinity, height: 54, child: FilledButton(
            onPressed: busy ? null : (sent ? verify : send),
            child: busy ? const CircularProgressIndicator(color: Colors.white) : Text(sent ? 'VERIFY & CONTINUE' : 'SEND OTP'),
          )),
          if (sent) TextButton(onPressed: () => setState(() => sent = false), child: const Text('Change mobile number')),
          const SizedBox(height: 28),
          const Text('CCTV | IT Security | Service & AMC', style: TextStyle(fontWeight: FontWeight.w700)),
          const Text('Station Road, Hotel Rajdoot, Ichalkaranji\n7350060071', style: TextStyle(color: Colors.black54)),
        ],
      )),
    ))),
  );
}

class CustomerHomePage extends StatefulWidget {
  const CustomerHomePage({super.key});
  @override State<CustomerHomePage> createState() => _CustomerHomePageState();
}
class _CustomerHomePageState extends State<CustomerHomePage> {
  final service = CustomerService(Supabase.instance.client);
  Map<String,dynamic>? customer;
  List<Map<String,dynamic>> tickets = [];
  bool loading = true;
  int unreadNotifications = 0;
  Timer? _homeTimer;
  late final PushNotificationService pushService;

  @override void initState() { super.initState(); pushService = PushNotificationService(Supabase.instance.client); pushService.initialize(); load(); _homeTimer = Timer.periodic(const Duration(seconds: 10), (_) => load()); }
  @override void dispose() { _homeTimer?.cancel(); super.dispose(); }
  Future<void> load() async {
    try {
      customer = await service.customer();
      tickets = await service.tickets();
      final user = Supabase.instance.client.auth.currentUser;
      if (user != null) {
        final rows = await Supabase.instance.client.from('notifications').select('id').eq('user_id', user.id).isFilter('read_at', null);
        unreadNotifications = rows.length;
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }
  Future<void> logout() async {
    await Supabase.instance.client.auth.signOut();
    final prefs=await SharedPreferences.getInstance();
    await prefs.remove('remember_until_ms');
    if (mounted) Navigator.pushAndRemoveUntil(context, MaterialPageRoute(builder: (_) => const LoginPage()), (_) => false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Unique Market', style: TextStyle(fontWeight: FontWeight.w800)), actions: [Stack(children: [IconButton(onPressed: () async { await Navigator.push(context, MaterialPageRoute(builder: (_) => CustomerNotificationsPage(service: pushService))); await load(); }, icon: const Icon(Icons.notifications_none_outlined)), if (unreadNotifications > 0) Positioned(right: 7, top: 7, child: Container(padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2), decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(10)), child: Text(unreadNotifications > 99 ? '99+' : unreadNotifications.toString(), style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800))))]), IconButton(onPressed: load, icon: const Icon(Icons.refresh)), PopupMenuButton<String>(onSelected: (v) { if (v == 'logout') logout(); }, itemBuilder: (_) => const [PopupMenuItem(value: 'logout', child: Text('Logout'))])]),
    body: RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(18), children: [
      Text('Namaskar, ' + (customer?['name']?.toString() ?? 'Customer'), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
      Text(customer?['customer_code']?.toString() ?? 'Customer Portal', style: const TextStyle(color: Colors.black54)),
      const SizedBox(height: 22),
      Row(children: [
        Expanded(child: _homeCard(Icons.add_circle_outline, 'Raise Complaint', () async { await Navigator.push(context, MaterialPageRoute(builder: (_) => const RaiseComplaintPage())); load(); })),
        const SizedBox(width: 12),
        Expanded(child: _homeCard(Icons.confirmation_num_outlined, 'My Tickets', () => Navigator.push(context, MaterialPageRoute(builder: (_) => TicketListPage(tickets: tickets))))),
      ]),
      const SizedBox(height: 12),
      _homeCard(Icons.verified_user_outlined, 'AMC Contracts', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AmcContractsPage()))),
      const SizedBox(height: 12),
      _homeCard(Icons.support_agent_outlined, 'Help & Support', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const HelpSupportPage()))),
      const SizedBox(height: 24),
      const Text('Recent Service', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
      const SizedBox(height: 10),
      if (loading) const Center(child: CircularProgressIndicator())
      else if (tickets.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(26), child: Center(child: Text('No complaints yet.'))))
      else ...tickets.take(5).map((t) => TicketTile(ticket: t)),
      const SizedBox(height: 18),
      const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('Support: 7350060071\nStation Road, Hotel Rajdoot, Ichalkaranji'))),
    ])),
    bottomNavigationBar: NavigationBar(destinations: const [
      NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
      NavigationDestination(icon: Icon(Icons.confirmation_num_outlined), label: 'Tickets'),
      NavigationDestination(icon: Icon(Icons.payments_outlined), label: 'Payments'),
      NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
    ], onDestinationSelected: (i) { if (i == 1) Navigator.push(context, MaterialPageRoute(builder: (_) => TicketListPage(tickets: tickets))); else if (i == 2) Navigator.push(context, MaterialPageRoute(builder: (_) => const CustomerPaymentsPage())); else if (i == 3) Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfilePage())); }),
  );

  Widget _homeCard(IconData icon, String title, VoidCallback onTap) => Card(child: InkWell(
    borderRadius: BorderRadius.circular(20), onTap: onTap,
    child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Icon(icon, color: const Color(0xFF0B63F6), size: 32), const SizedBox(height: 14),
      Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
      const SizedBox(height: 4), const Text('Open', style: TextStyle(color: Colors.black45)),
    ])),
  ));
}

class HelpSupportPage extends StatelessWidget {
  const HelpSupportPage({super.key});
  Future<void> call(BuildContext context)async{
    final ok=await launchUrl(Uri(scheme:'tel',path:'7350060071'));
    if(!ok&&context.mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Could not open phone dialer.')));
  }
  Future<void> whatsapp(BuildContext context)async{
    final ok=await launchUrl(Uri.parse('https://wa.me/917350060071'),mode:LaunchMode.externalApplication);
    if(!ok&&context.mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Could not open WhatsApp.')));
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Help & Support')),
    body:ListView(padding:const EdgeInsets.all(18),children:[
      const Card(child:Padding(padding:EdgeInsets.all(20),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text('UNIQUE MARKET',style:TextStyle(fontSize:22,fontWeight:FontWeight.w900)),
        SizedBox(height:6),Text('CCTV | IT Security | Service & AMC',style:TextStyle(fontWeight:FontWeight.w700)),
        SizedBox(height:12),Text('Station Road, Hotel Rajdoot, Ichalkaranji'),
        Text('7350060071'),
      ]))),
      const SizedBox(height:14),
      Card(child:ListTile(leading:const Icon(Icons.call_outlined),title:const Text('Call Unique Market'),subtitle:const Text('7350060071'),onTap:()=>call(context))),
      Card(child:ListTile(leading:const Icon(Icons.chat_outlined),title:const Text('WhatsApp Support'),subtitle:const Text('Chat with Unique Market'),onTap:()=>whatsapp(context))),
      Card(child:ListTile(leading:const Icon(Icons.location_on_outlined),title:const Text('Office Location'),subtitle:const Text('Station Road, Hotel Rajdoot, Ichalkaranji'),onTap:()=>launchUrl(Uri.parse('https://www.google.com/maps/search/?api=1&query=Station+Road+Hotel+Rajdoot+Ichalkaranji'),mode:LaunchMode.externalApplication))),
      const SizedBox(height:12),
      const Card(child:Padding(padding:EdgeInsets.all(18),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text('Common Help',style:TextStyle(fontSize:18,fontWeight:FontWeight.w800)),
        SizedBox(height:10),Text('• CCTV camera offline\n• DVR/NVR recording issue\n• Internet/network issue\n• Computer/Laptop error\n• AMC renewal'),
      ]))),
    ]));
}
class AmcContractsPage extends StatefulWidget {
  const AmcContractsPage({super.key});
  @override State<AmcContractsPage> createState()=>_AmcContractsPageState();
}
class _AmcContractsPageState extends State<AmcContractsPage>{
  final service=CustomerService(); List<Map<String,dynamic>> items=[]; bool loading=true; Timer? timer;
  @override void initState(){super.initState();load();timer=Timer.periodic(const Duration(seconds:10),(_)=>load());}
  @override void dispose(){timer?.cancel();super.dispose();}
  Future<void> load()async{try{items=await service.amcContracts();}catch(_){items=[];}if(mounted)setState(()=>loading=false);}
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('AMC Contracts'),actions:[IconButton(onPressed:load,icon:const Icon(Icons.refresh))]),
    body:loading?const Center(child:CircularProgressIndicator()):RefreshIndicator(onRefresh:load,child:ListView(padding:const EdgeInsets.all(16),children:[
      if(items.isEmpty) const Card(child:Padding(padding:EdgeInsets.all(24),child:Center(child:Text('No AMC contracts found.')))),
      ...items.map((a){final status=(a['status']??'').toString();final start=(a['start_date']??'').toString();final end=(a['end_date']??'').toString();return Card(margin:const EdgeInsets.only(bottom:12),child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Row(children:[const Icon(Icons.shield_outlined),const SizedBox(width:10),Expanded(child:Text(status.isEmpty?'AMC Contract':status,style:const TextStyle(fontSize:17,fontWeight:FontWeight.w800)))]),
        const SizedBox(height:12),Text('Start: '+(start.isEmpty?'—':start)),Text('Expiry: '+(end.isEmpty?'—':end)),if((a['notes']??'').toString().isNotEmpty)Padding(padding:const EdgeInsets.only(top:8),child:Text('Notes: '+a['notes'].toString())),const SizedBox(height:12),_RenewButton(service:service,amcId:a['id'].toString()),
      ])));})
    ])));
}

class _RenewButton extends StatefulWidget { final CustomerService service; final String amcId; const _RenewButton({required this.service,required this.amcId}); @override State<_RenewButton> createState()=>_RenewButtonState(); }
class _RenewButtonState extends State<_RenewButton>{ bool busy=false; String status=''; @override void initState(){super.initState();load();} Future<void> load()async{final r=await widget.service.amcRenewalRequest(widget.amcId);if(mounted)setState(()=>status=(r?['status']??'').toString());} Future<void> request()async{setState(()=>busy=true);try{await widget.service.requestAmcRenewal(widget.amcId,notes:'Customer requested AMC renewal.');if(mounted){setState(()=>status='pending');ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('AMC renewal request sent.')));}}catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('Could not send request: $e')));}finally{if(mounted)setState(()=>busy=false);}} @override Widget build(BuildContext context){if(status.isNotEmpty)return Text('Renewal request: '+status.toUpperCase(),style:const TextStyle(fontWeight:FontWeight.w700));return SizedBox(width:double.infinity,child:OutlinedButton.icon(onPressed:busy?null:request,icon:busy?const SizedBox(width:16,height:16,child:CircularProgressIndicator(strokeWidth:2)):const Icon(Icons.autorenew),label:const Text('REQUEST AMC RENEWAL')));}}
class CustomerNotificationsPage extends StatefulWidget {
  final PushNotificationService service;
  const CustomerNotificationsPage({super.key, required this.service});
  @override State<CustomerNotificationsPage> createState()=>_CustomerNotificationsPageState();
}
class _CustomerNotificationsPageState extends State<CustomerNotificationsPage>{
  List<Map<String,dynamic>> items=[]; bool loading=true; Timer? _timer;
  @override void initState(){super.initState();load(); _timer=Timer.periodic(const Duration(seconds:10), (_) => load());}
  @override void dispose(){_timer?.cancel();super.dispose();}
  Future<void> load()async{
    final user=Supabase.instance.client.auth.currentUser;
    if(user==null){if(mounted)setState(()=>loading=false);return;}
    try{
      final rows=await Supabase.instance.client.from('notifications').select().eq('user_id',user.id).order('created_at',ascending:false).limit(100);
      items=List<Map<String,dynamic>>.from(rows);
    }catch(_){}
    if(mounted)setState(()=>loading=false);
  }
  Future<void> openNotification(Map<String,dynamic> n)async{
    final id=n['id']?.toString();
    if(id!=null&&id.isNotEmpty)await markRead(id);
    if(!mounted)return;
    final complaintId=n['complaint_id']?.toString();
    if(complaintId==null||complaintId.isEmpty)return;
    try{
      final ticket=await Supabase.instance.client.from('complaints').select().eq('id',complaintId).maybeSingle();
      if(ticket!=null&&mounted){
        await Navigator.push(context,MaterialPageRoute(builder:(_)=>TicketDetailsPage(ticket:Map<String,dynamic>.from(ticket))));
      }
    }catch(e){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Could not open ticket.')));
    }
  }
  Future<void> markRead(String id)async{try{await Supabase.instance.client.from('notifications').update({'read_at':DateTime.now().toUtc().toIso8601String()}).eq('id',id);await load();}catch(_){}}
  String _time(dynamic value){
    final d=DateTime.tryParse((value??'').toString());
    if(d==null)return '';
    final local=d.toLocal();
    final h=local.hour%12==0?12:local.hour%12;
    final m=local.minute.toString().padLeft(2,'0');
    final period=local.hour>=12?'PM':'AM';
    return '${local.day.toString().padLeft(2,'0')}/${local.month.toString().padLeft(2,'0')}/${local.year}  $h:$m $period';
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Notifications'),actions:[IconButton(onPressed:load,icon:const Icon(Icons.refresh))]),
    body:loading?const Center(child:CircularProgressIndicator()):RefreshIndicator(onRefresh:load,child:ListView(padding:const EdgeInsets.all(12),children:[
      if(items.isEmpty)const Card(child:Padding(padding:EdgeInsets.all(28),child:Center(child:Text('No notifications yet.')))),
      ...items.map((n){final unread=n['read_at']==null;final hasTicket=n['complaint_id']!=null;return Card(child:ListTile(
        leading:CircleAvatar(child:Icon(unread?Icons.notifications_active_outlined:Icons.notifications_none_outlined)),
        title:Text((n['title']??'Unique Market').toString(),style:TextStyle(fontWeight:unread?FontWeight.w900:FontWeight.w600)),
        subtitle:Text((n['message']??'').toString()+'\n'+_time(n['created_at']),maxLines:3),
        trailing:hasTicket?const Icon(Icons.chevron_right):null,
        onTap:()=>openNotification(n),
      ));})
    ])),
  );
}

class RaiseComplaintPage extends StatefulWidget {
  const RaiseComplaintPage({super.key});
  @override State<RaiseComplaintPage> createState() => _RaiseComplaintPageState();
}
class _RaiseComplaintPageState extends State<RaiseComplaintPage> {
  final description = TextEditingController();
  final address = TextEditingController();
  String serviceType = 'CCTV', category = 'Camera offline';
  Position? position;
  DateTime? visit;
  bool busy = false, locating = false;
  final services = const ['CCTV','Computer/Laptop','Networking','AMC','Other'];
  final problems = const ['Camera offline','DVR/NVR issue','Recording issue','Internet/network issue','Computer error','Other'];

  Future<void> locate() async {
    setState(() => locating = true);
    try {
      if (!await Geolocator.isLocationServiceEnabled()) throw Exception('Turn on Location first.');
      var p = await Geolocator.checkPermission();
      if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
      if (p == LocationPermission.denied || p == LocationPermission.deniedForever) throw Exception('Location permission denied.');
      position = await Geolocator.getCurrentPosition();
      address.text = 'Current location: ' + position!.latitude.toStringAsFixed(6) + ', ' + position!.longitude.toStringAsFixed(6);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally { if (mounted) setState(() => locating = false); }
  }

  Future<void> submit() async {
    if (description.text.trim().isEmpty || address.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter description and address.')));
      return;
    }
    setState(() => busy = true);
    try {
      final ticket = await CustomerService(Supabase.instance.client).createComplaint(
        category: category, serviceType: serviceType, description: description.text.trim(),
        address: address.text.trim(), latitude: position?.latitude, longitude: position?.longitude, preferredVisit: visit,
      );
      if (!mounted) return;
      await showDialog(context: context, builder: (_) => AlertDialog(
        title: const Text('Complaint Registered'),
        content: Text('Ticket: ' + (ticket['ticket_no'] ?? ticket['complaint_no'] ?? ticket['id']).toString() + '\nStatus: New'),
        actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Done'))],
      ));
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally { if (mounted) setState(() => busy = false); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Raise Complaint')),
    body: ListView(padding: const EdgeInsets.all(18), children: [
      const Text('Tell us what needs attention.', style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900)),
      const SizedBox(height: 18),
      const Text('Service Type', style: TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      Wrap(spacing: 8, children: services.map((s) => ChoiceChip(label: Text(s), selected: serviceType == s, onSelected: (_) => setState(() => serviceType = s))).toList()),
      const SizedBox(height: 18),
      DropdownButtonFormField<String>(value: category, decoration: const InputDecoration(labelText: 'Problem'), items: problems.map((p) => DropdownMenuItem(value: p, child: Text(p))).toList(), onChanged: (v) => setState(() => category = v!)),
      const SizedBox(height: 16),
      TextField(controller: description, maxLines: 4, decoration: const InputDecoration(labelText: 'Description')),
      const SizedBox(height: 16),
      TextField(controller: address, maxLines: 2, decoration: InputDecoration(labelText: 'Service Address', prefixIcon: const Icon(Icons.location_on_outlined), suffixIcon: IconButton(onPressed: locating ? null : locate, icon: locating ? const CircularProgressIndicator() : const Icon(Icons.my_location)))),
      const SizedBox(height: 8),
      OutlinedButton.icon(onPressed: locating ? null : locate, icon: const Icon(Icons.gps_fixed), label: const Text('Use Current Location')),
      const SizedBox(height: 12),
      ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.calendar_month_outlined), title: Text(visit == null ? 'Preferred Visit Time' : visit.toString()), subtitle: const Text('Optional'), onTap: () async {
        final d = await showDatePicker(context: context, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 60)), initialDate: DateTime.now());
        if (d == null || !mounted) return;
        final t = await showTimePicker(context: context, initialTime: TimeOfDay.now());
        if (t != null) setState(() => visit = DateTime(d.year,d.month,d.day,t.hour,t.minute));
      }),
      const SizedBox(height: 18),
      SizedBox(height: 54, child: FilledButton(onPressed: busy ? null : submit, child: busy ? const CircularProgressIndicator(color: Colors.white) : const Text('SUBMIT COMPLAINT'))),
    ]),
  );
}

class TicketListPage extends StatelessWidget {
  final List<Map<String,dynamic>> tickets;
  const TicketListPage({super.key, required this.tickets});
  @override Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('My Tickets')),
    body: tickets.isEmpty
      ? const Center(child: Text('No tickets yet.'))
      : ListView.builder(padding: const EdgeInsets.all(16), itemCount: tickets.length, itemBuilder: (_, i) => TicketTile(ticket: tickets[i])),
  );
}

class TicketTile extends StatelessWidget {
  final Map<String,dynamic> ticket;
  const TicketTile({super.key, required this.ticket});
  @override Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 10),
    child: ListTile(
      leading: const CircleAvatar(child: Icon(Icons.confirmation_num_outlined)),
      title: Text((ticket['ticket_no'] ?? ticket['complaint_no'] ?? 'Ticket').toString(), style: const TextStyle(fontWeight: FontWeight.w800)),
      subtitle: Text((ticket['title'] ?? ticket['description'] ?? '').toString(), maxLines: 2, overflow: TextOverflow.ellipsis),
      trailing: Text((ticket['status'] ?? 'New').toString(), style: const TextStyle(fontWeight: FontWeight.w700)),
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => TicketDetailsPage(ticket: ticket))),
    ),
  );
}

class TicketDetailsPage extends StatefulWidget {
  final Map<String,dynamic> ticket;
  const TicketDetailsPage({super.key, required this.ticket});
  @override State<TicketDetailsPage> createState() => _TicketDetailsPageState();
}

class _TicketDetailsPageState extends State<TicketDetailsPage> {
  final service = CustomerService(Supabase.instance.client);
  Map<String,dynamic> currentTicket = {};
  Timer? _refreshTimer;
  Map<String,dynamic>? visit;
  Map<String,dynamic>? report;
  List<Map<String,dynamic>> payments = [];
  bool loading = true;

  @override void initState() { super.initState(); currentTicket = Map<String,dynamic>.from(widget.ticket); load(); _refreshTimer = Timer.periodic(const Duration(seconds: 10), (_) => load()); }

  @override void dispose() { _refreshTimer?.cancel(); super.dispose(); }

  Future<void> load() async {
    try {
      final id = widget.ticket['id'].toString();
      final c = await service.complaint(id);
      final v = await service.visitForComplaint(id);
      final r = await service.serviceReport(id);
      final p = await service.paymentsForComplaint(id);
      if (mounted) setState(() { if (c != null) currentTicket = c; visit = v; report = r; payments = p; loading = false; });
    } catch (e) {
      if (mounted) setState(() => loading = false);
    }
  }

  @override Widget build(BuildContext context) {
    final t = currentTicket.isEmpty ? widget.ticket : currentTicket;
    final status = (t['status'] ?? 'New').toString();
    final techName = visit?['technician_name']?.toString() ?? 'Technician will be assigned';
    return Scaffold(
      appBar: AppBar(title: const Text('Ticket Details')),
      body: loading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
          onRefresh: load,
          child: ListView(padding: const EdgeInsets.all(16), children: [
            _sectionCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text((t['ticket_no'] ?? t['complaint_no'] ?? 'Ticket').toString(), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                _statusChip(status),
                const SizedBox(height: 16),
                _row('Service', t['service_type'] ?? '-'),
                _row('Problem', t['category'] ?? '-'),
                _row('Description', t['description'] ?? '-'),
                _row('Address', t['address'] ?? t['location_text'] ?? '-'),
              ]),
            ),
            const SizedBox(height: 12),
            _sectionCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Service Status', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              _timeline(status),
            ])),
            const SizedBox(height: 12),
            _sectionCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Technician & Visit', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              _row('Technician', techName),
              _row('Technician Mobile', visit?['technician_mobile'] ?? '-'),
              _row('Technician ID', visit?['technician_id'] ?? '-'),
              _row('Visit', t['scheduled_visit_at'] ?? t['scheduled_visit_date'] ?? 'Not scheduled'),
              _row('Live Status', status),
              if (visit?['started_at'] != null) _row('Service Started', visit!['started_at']),
              if (visit?['completed_at'] != null) _row('Service Completed', visit!['completed_at']),
              if (visit?['work_done'] != null) _row('Work Done', visit!['work_done']),
              if (visit?['diagnosis'] != null) _row('Diagnosis', visit!['diagnosis']),
              if (visit?['work_done'] != null) _row('Work done', visit!['work_done']),
              const SizedBox(height: 8),
              Wrap(spacing: 8, children: [
                OutlinedButton.icon(onPressed: () => _callSupport(context), icon: const Icon(Icons.phone_outlined), label: const Text('Call')),
                OutlinedButton.icon(onPressed: () => _whatsapp(context), icon: const Icon(Icons.chat_outlined), label: const Text('WhatsApp')),
              ]),
            ])),
            if (report != null && (status == 'In Service' || status == 'Completed')) ...[
              const SizedBox(height: 12),
              _sectionCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Service Completion', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                if (report!['customer_otp']?.toString().isNotEmpty == true && report!['customer_otp_verified'] != true) ...[
                  const Text('Give this verification code to the technician when service is ready for completion.', style: TextStyle(color: Colors.black54)),
                  const SizedBox(height: 10),
                  Center(child: Text(report!['customer_otp'].toString(), style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, letterSpacing: 6))),
                ] else if (report!['customer_otp_verified'] == true) const ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.verified, color: Colors.green), title: Text('Customer Verification Complete')),
                if ((report!['diagnosis']?.toString() ?? '').isNotEmpty) _row('Diagnosis', report!['diagnosis']),
                if ((report!['work_summary']?.toString() ?? '').isNotEmpty) _row('Work done', report!['work_summary']),
                if (report!['labour_amount'] != null) _row('Labour', '₹' + report!['labour_amount'].toString()),
                if (report!['other_amount'] != null) _row('Other', '₹' + report!['other_amount'].toString()),
                if (status == 'Completed') const ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.check_circle, color: Colors.green), title: Text('Service Completed')),
              ])),
            ],
            if (status == 'Completed') ...[
              const SizedBox(height: 12),
              ServiceReviewCard(service: service, complaintId: widget.ticket['id'].toString()),
            ],
            if (status == 'Completed') ...[
              const SizedBox(height: 12),
              ServiceReviewCard(service: service, complaintId: t['id'].toString()),
            ],
            const SizedBox(height: 12),
            if (status == 'Completed') _sectionCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Invoice', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              const Text('Your service is completed. You can view or print the invoice.'),
              const SizedBox(height: 10),
              FilledButton.icon(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => InvoicePage(complaint: t, payments: payments))), icon: const Icon(Icons.picture_as_pdf_outlined), label: const Text('VIEW / PRINT INVOICE')),
            ]),
            if (status == 'Completed') const SizedBox(height: 12),
            _sectionCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Payment', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              if (payments.isEmpty) const Text('No payment recorded yet.', style: TextStyle(color: Colors.black54)),
              ...payments.map((p) => ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.receipt_long_outlined), title: Text('₹' + (p['amount'] ?? 0).toString()), subtitle: Text((p['mode'] ?? '-') .toString() + ' • ' + (p['payment_status'] ?? p['status'] ?? 'Pending').toString()))),
              const SizedBox(height: 4),
              FilledButton.icon(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PaymentPage(complaint: t))).then((_) => load()), icon: const Icon(Icons.payments_outlined), label: const Text('Make / Update Payment')),
            ])),
          ]),
        ),
    );
  }

  Widget _sectionCard({required Widget child}) => Card(child: Padding(padding: const EdgeInsets.all(18), child: child));
  Widget _row(String label, dynamic value) => Padding(padding: const EdgeInsets.only(bottom: 9), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [SizedBox(width: 105, child: Text(label, style: const TextStyle(color: Colors.black54))), Expanded(child: Text(value?.toString() ?? '-', style: const TextStyle(fontWeight: FontWeight.w600)))]));
  Widget _statusChip(String s) => Chip(label: Text(s), avatar: const Icon(Icons.circle, size: 10));
  Widget _timeline(String status) {
    const steps = ['New','Assigned','Scheduled','On The Way','Reached','In Service','Completed'];
    final normalized = status.toLowerCase().replaceAll('_',' ');
    int active = steps.indexWhere((s) => normalized.contains(s.toLowerCase()));
    if (active < 0) active = status.toLowerCase() == 'assigned' ? 1 : 0;
    return Column(children: steps.asMap().entries.map((e) {
      final done = e.key <= active;
      return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Column(children: [Icon(done ? Icons.check_circle : Icons.radio_button_unchecked, size: 22), if (e.key < steps.length-1) Container(width: 2, height: 28, color: Colors.black12)]),
        const SizedBox(width: 12), Padding(padding: const EdgeInsets.only(top: 2), child: Text(e.value, style: TextStyle(fontWeight: done ? FontWeight.w800 : FontWeight.w500))),
      ]);
    }).toList());
  }
  Future<void> _callSupport(BuildContext context) async {
    final uri=Uri(scheme:'tel',path:'7350060071');
    if(!await launchUrl(uri)) {
      if(context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Could not open phone dialer.')));
    }
  }
  Future<void> _whatsapp(BuildContext context) async {
    final uri=Uri.parse('https://wa.me/917350060071');
    if(!await launchUrl(uri,mode:LaunchMode.externalApplication)) {
      if(context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Could not open WhatsApp.')));
    }
  }
}

class ServiceReviewCard extends StatefulWidget {
  final CustomerService service; final String complaintId;
  const ServiceReviewCard({super.key,required this.service,required this.complaintId});
  @override State<ServiceReviewCard> createState()=>_ServiceReviewCardState();
}
class _ServiceReviewCardState extends State<ServiceReviewCard>{
  int rating=0; final feedback=TextEditingController(); bool loading=true,saving=false;
  @override void initState(){super.initState();load();}
  @override void dispose(){feedback.dispose();super.dispose();}
  Future<void>load()async{try{final r=await widget.service.reviewForComplaint(widget.complaintId);if(r!=null&&mounted){setState(()=>{rating=(r['rating'] as num).toInt(),feedback.text=(r['feedback']??'').toString(),loading=false});}else if(mounted)setState(()=>loading=false);}catch(_){if(mounted)setState(()=>loading=false);}}
  Future<void>save()async{if(rating<1)return;setState(()=>saving=true);try{await widget.service.saveReview(complaintId:widget.complaintId,rating:rating,feedback:feedback.text);if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Thank you for your feedback.')));}catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('Could not save feedback: $e')));}finally{if(mounted)setState(()=>saving=false);}}
  @override Widget build(BuildContext context)=>Card(child:Padding(padding:const EdgeInsets.all(18),child:loading?const Center(child:CircularProgressIndicator()):Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    const Text('Service Review',style:TextStyle(fontSize:18,fontWeight:FontWeight.w800)),
    const SizedBox(height:6),Text(rating>0?'Thank you for rating our service.':'How was your service experience?',style:const TextStyle(color:Colors.black54)),
    const SizedBox(height:10),Row(mainAxisAlignment:MainAxisAlignment.center,children:List.generate(5,(i)=>IconButton(onPressed:()=>setState(()=>rating=i+1),icon:Icon(i<rating?Icons.star:Icons.star_border,size:32),tooltip:'${i+1} star'))),
    TextField(controller:feedback,maxLines:3,decoration:const InputDecoration(labelText:'Feedback (optional)',hintText:'Tell us what we can improve')),
    const SizedBox(height:10),SizedBox(width:double.infinity,child:FilledButton.icon(onPressed:saving?null:save,icon:saving?const SizedBox(width:18,height:18,child:CircularProgressIndicator(strokeWidth:2)):const Icon(Icons.send_outlined),label:Text(rating>0?'SAVE REVIEW':'SELECT A RATING'))),
  ])));
}
class PaymentPage extends StatefulWidclass CustomerPaymentsPage extends StatefulWidget {
  const CustomerPaymentsPage({super.key});
  @override State<CustomerPaymentsPage> createState()=>_CustomerPaymentsPageState();
}
class _CustomerPaymentsPageState extends State<CustomerPaymentsPage>{
  final service=CustomerService(Supabase.instance.client);
  List<Map<String,dynamic>> tickets=[];
  Map<String,List<Map<String,dynamic>>> paymentMap={};
  bool loading=true; Timer? timer;
  @override void initState(){super.initState();load();timer=Timer.periodic(const Duration(seconds:10),(_)=>load());}
  @override void dispose(){timer?.cancel();super.dispose();}
  double _num(dynamic v)=>double.tryParse((v??0).toString())??0;
  double _paid(List<Map<String,dynamic>> ps)=>ps.fold(0.0,(s,p){final st=(p['payment_status']??p['status']??'').toString().toLowerCase();return s+(['approved','paid','completed'].contains(st)?_num(p['amount']):0);});
  String _status(List<Map<String,dynamic>> ps){if(ps.isEmpty)return 'No payment';final states=ps.map((p)=>(p['payment_status']??p['status']??'pending').toString().toLowerCase()).toSet();if(states.contains('pending'))return 'Verification pending';if(states.every((s)=>['approved','paid','completed'].contains(s)))return 'Paid';if(states.contains('rejected'))return 'Rejected';return 'Pending';}
  Future<void> load()async{try{tickets=await service.tickets();final m=<String,List<Map<String,dynamic>>>{};for(final t in tickets){final id=t['id']?.toString();if(id!=null&&id.isNotEmpty)m[id]=await service.paymentsForComplaint(id);}paymentMap=m;}catch(_){}if(mounted)setState(()=>loading=false);}
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Payments'),actions:[IconButton(onPressed:load,icon:const Icon(Icons.refresh))]),body:loading?const Center(child:CircularProgressIndicator()):RefreshIndicator(onRefresh:load,child:ListView(padding:const EdgeInsets.all(16),children:[
    const Text('Service Payments',style:TextStyle(fontSize:25,fontWeight:FontWeight.w900)),const SizedBox(height:6),const Text('Payment status and history for all service tickets.',style:TextStyle(color:Colors.black54)),const SizedBox(height:16),
    if(tickets.isEmpty)const Card(child:Padding(padding:EdgeInsets.all(26),child:Center(child:Text('No service tickets yet.')))),
    ...tickets.map((t){final id=t['id']?.toString()??'';final ps=paymentMap[id]??[];final status=_status(ps);return Card(margin:const EdgeInsets.only(bottom:12),child:ListTile(
      leading:const CircleAvatar(child:Icon(Icons.receipt_long_outlined)),
      title:Text((t['ticket_no']??t['complaint_no']??'Ticket').toString(),style:const TextStyle(fontWeight:FontWeight.w800)),
      subtitle:Text((t['service_type']??t['category']??'Service').toString()+'\n'+status),
      trailing:const Icon(Icons.chevron_right),
      onTap:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>PaymentPage(complaint:t))).then((_)=>load()),
    ));})
  ])));
}
get {
  final Map<String,dynamic> complaint;
  const PaymentPage({super.key, required this.complaint});
  @override State<PaymentPage> createState() => _PaymentPageState();
}
class _PaymentPageState extends State<PaymentPage> {
  final amount=TextEditingController(), utr=TextEditingController();
  String mode='UPI'; bool busy=false,loading=true; Map<String,dynamic>? report; List<Map<String,dynamic>> payments=[];
  double _num(dynamic v)=>double.tryParse((v??0).toString())??0;
  double get serviceTotal=>_num(report?['labour_amount'])+_num(report?['other_amount']);
  double get approvedPaid=>payments.fold(0.0,(s,p){final st=(p['payment_status']??p['status']??'').toString().toLowerCase();return s+(['approved','paid','completed'].contains(st)?_num(p['amount']):0);});
  double get due=>(serviceTotal-approvedPaid).clamp(0,double.infinity);
  @override void initState(){super.initState();load();}
  Future<void> load()async{try{final id=widget.complaint['id'].toString();final svc=CustomerService(Supabase.instance.client);report=await svc.serviceReport(id);payments=await svc.paymentsForComplaint(id);if(amount.text.trim().isEmpty&&due>0)amount.text=due.toStringAsFixed(2);}catch(_){}if(mounted)setState(()=>loading=false);}
  Future<void> submit()async{
    final value=double.tryParse(amount.text.trim());
    if(value==null||value<=0){ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Enter a valid amount.')));return;}
    if(serviceTotal>0&&value>due+0.01){ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('Maximum payable balance is ₹${due.toStringAsFixed(2)}.')));return;}
    if(mode=='UPI'&&utr.text.trim().isEmpty){ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Enter UTR / reference number after payment.')));return;}
    setState(()=>busy=true);try{await CustomerService(Supabase.instance.client).recordPayment(complaintId:widget.complaint['id'].toString(),amount:value,mode:mode,referenceNo:utr.text.trim().isEmpty?null:utr.text.trim());if(!mounted)return;ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Payment submitted. Admin verification is pending.')));Navigator.pop(context);}catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(e.toString())));}finally{if(mounted)setState(()=>busy=false);}
  }
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Payment'),actions:[IconButton(onPressed:loading?null:load,icon:const Icon(Icons.refresh))]),body:loading?const Center(child:CircularProgressIndicator()):ListView(padding:const EdgeInsets.all(18),children:[
    const Text('Service Payment',style:TextStyle(fontSize:24,fontWeight:FontWeight.w900)),const SizedBox(height:6),Text('Ticket: '+(widget.complaint['ticket_no']??widget.complaint['complaint_no']??'-').toString(),style:const TextStyle(color:Colors.black54)),const SizedBox(height:18),
    Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(children:[_amountRow('Service Charges',serviceTotal),_amountRow('Approved Paid',approvedPaid),const Divider(),_amountRow('Balance Due',due,bold:true)]))),
    const SizedBox(height:18),if(serviceTotal<=0)const Card(child:Padding(padding:EdgeInsets.all(14),child:Text('Final service charges are not available yet. You can still submit a payment amount.'))),const SizedBox(height:8),
    TextField(controller:amount,keyboardType:const TextInputType.numberWithOptions(decimal:true),decoration:const InputDecoration(labelText:'Amount',prefixText:'₹ ')),const SizedBox(height:16),
    const Text('Payment Mode',style:TextStyle(fontWeight:FontWeight.w700)),const SizedBox(height:8),
    Wrap(spacing:8,children:['UPI','Cash'].map((m)=>ChoiceChip(label:Text(m),selected:mode==m,onSelected:(_)=>setState(()=>mode=m))).toList()),
    if(mode=='UPI')...[
      const SizedBox(height:16),const Card(child:Padding(padding:EdgeInsets.all(16),child:Text('Pay using your UPI app, then enter the UTR / reference number below.'))),const SizedBox(height:12),
      TextField(controller:utr,decoration:const InputDecoration(labelText:'UTR / Reference Number'))],
    if(payments.any((p)=>(p['payment_status']??p['status']??'').toString().toLowerCase()=='pending'))const Padding(padding:EdgeInsets.only(top:12),child:Text('A payment is already awaiting admin verification.',style:TextStyle(color:Colors.orange))),
    const SizedBox(height:24),SizedBox(height:54,child:FilledButton(onPressed:busy?null:submit,child:busy?const CircularProgressIndicator(color:Colors.white):const Text('SUBMIT PAYMENT')))
  ]));
  Widget _amountRow(String label,double value,{bool bold=false})=>Padding(padding:const EdgeInsets.symmetric(vertical:4),child:Row(mainAxisAlignment:MainAxisAlignment.spaceBetween,children:[Text(label,style:TextStyle(fontWeight:bold?FontWeight.w900:FontWeight.w500)),Text('₹'+value.toStringAsFixed(2),style:TextStyle(fontWeight:bold?FontWeight.w900:FontWeight.w700))]));
}

class InvoicePage extends StatefulWidget {
  final Map<String,dynamic> complaint;
  final List<Map<String,dynamic>> payments;
  const InvoicePage({super.key,required this.complaint,required this.payments});
  @override State<InvoicePage> createState()=>_InvoicePageState();
}
class _InvoicePageState extends State<InvoicePage>{
  final service=CustomerService(Supabase.instance.client);
  Map<String,dynamic>? report;
  List<Map<String,dynamic>> payments=[];
  bool loading=true;
  Timer? _timer;
  double _num(dynamic v)=>double.tryParse((v??0).toString())??0;
  double get total=>_num(report?['labour_amount'])+_num(report?['other_amount']);
  double get paid=>payments.fold(0.0,(s,p){final st=(p['payment_status']??p['status']??'').toString().toLowerCase();return s+(['approved','paid','completed'].contains(st)?_num(p['amount']):0);});
  double get pending=>payments.fold(0.0,(s,p){final st=(p['payment_status']??p['status']??'').toString().toLowerCase();return s+(st=='pending'?_num(p['amount']):0);});
  double get balance=>(total-paid).clamp(0,double.infinity);

  @override void initState(){super.initState();load();_timer=Timer.periodic(const Duration(seconds:10),(_)=>load());}
  @override void dispose(){_timer?.cancel();super.dispose();}

  Future<void> load()async{
    try{
      final id=widget.complaint['id'].toString();
      final results=await Future.wait([service.serviceReport(id),service.paymentsForComplaint(id)]);
      report=results[0] as Map<String,dynamic>?;
      payments=List<Map<String,dynamic>>.from(results[1] as List<Map<String,dynamic>>);
    }catch(_){}
    if(mounted)setState(()=>loading=false);
  }

  Future<void> printInvoice()async{
    final t=widget.complaint;
    final status=balance<=0&&total>0?'PAID':pending>0?'PAYMENT VERIFICATION PENDING':'PAYMENT PENDING';
    final doc=pw.Document();
    doc.addPage(pw.Page(build:(_)=>pw.Padding(padding:const pw.EdgeInsets.all(24),child:pw.Column(crossAxisAlignment:pw.CrossAxisAlignment.start,children:[
      pw.Text('UNIQUE MARKET',style:pw.TextStyle(fontSize:24,fontWeight:pw.FontWeight.bold)),
      pw.Text('CCTV | IT Security | Service & AMC'),
      pw.Text('Station Road, Hotel Rajdoot, Ichalkaranji | 7350060071'),
      pw.Divider(),
      pw.Text('SERVICE INVOICE',style:pw.TextStyle(fontSize:18,fontWeight:pw.FontWeight.bold)),
      pw.Text('Ticket: '+(t['ticket_no']??t['complaint_no']??'-').toString()),
      pw.Text('Service: '+(t['service_type']??'-').toString()),
      pw.Text('Problem: '+(t['category']??'-').toString()),
      pw.Text('Customer: '+(t['customer_name']??'-').toString()),
      pw.Text('Address: '+(t['address']??'-').toString()),
      pw.SizedBox(height:18),
      pw.Text('Service Charges: Rs. '+total.toStringAsFixed(2)),
      pw.Text('Approved Paid: Rs. '+paid.toStringAsFixed(2)),
      pw.Text('Pending Verification: Rs. '+pending.toStringAsFixed(2)),
      pw.Text('Balance Due: Rs. '+balance.toStringAsFixed(2)),
      pw.Text('Payment Status: '+status,style:pw.TextStyle(fontSize:16,fontWeight:pw.FontWeight.bold)),
      pw.SizedBox(height:18),
      pw.Text('Thank you for choosing Unique Market.')
    ])));
    await Printing.layoutPdf(onLayout:(_)=>doc.save());
  }

  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Invoice'),actions:[IconButton(onPressed:loading?null:load,icon:const Icon(Icons.refresh))]),
    body:loading?const Center(child:CircularProgressIndicator()):RefreshIndicator(
      onRefresh:load,
      child:ListView(padding:const EdgeInsets.all(18),children:[
        Card(child:Padding(padding:const EdgeInsets.all(20),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('UNIQUE MARKET',style:TextStyle(fontSize:25,fontWeight:FontWeight.w900)),
          const Text('SERVICE INVOICE',style:TextStyle(fontWeight:FontWeight.w700)),
          const Divider(height:28),
          Text('Ticket: '+(widget.complaint['ticket_no']??widget.complaint['complaint_no']??'-').toString()),
          Text('Service: '+(widget.complaint['service_type']??'-').toString()),
          Text('Service Charges: ₹'+total.toStringAsFixed(2)),
          Text('Approved Paid: ₹'+paid.toStringAsFixed(2)),
          if(pending>0)Text('Pending Verification: ₹'+pending.toStringAsFixed(2),style:const TextStyle(color:Colors.orange,fontWeight:FontWeight.w700)),
          Text('Balance Due: ₹'+balance.toStringAsFixed(2),style:const TextStyle(fontSize:18,fontWeight:FontWeight.w900)),
          Text('Payment Status: '+(balance<=0&&total>0?'PAID':pending>0?'PAYMENT VERIFICATION PENDING':'PAYMENT PENDING'),style:const TextStyle(fontWeight:FontWeight.w800)),
          const SizedBox(height:18),
          const Text('Station Road, Hotel Rajdoot, Ichalkaranji'),
          const Text('7350060071')
        ]))),
        const SizedBox(height:16),
        if(payments.isNotEmpty)Card(child:Padding(padding:const EdgeInsets.all(14),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('Payment History',style:TextStyle(fontSize:17,fontWeight:FontWeight.w800)),
          ...payments.map((p)=>ListTile(contentPadding:EdgeInsets.zero,leading:const Icon(Icons.receipt_long_outlined),title:Text('₹'+_num(p['amount']).toStringAsFixed(2)),subtitle:Text((p['mode']??'-').toString()+' • '+(p['payment_status']??p['status']??'Pending').toString()+(p['reference_no']!=null?' • '+p['reference_no'].toString():'')))
        ]))),
        const SizedBox(height:16),
        FilledButton.icon(onPressed:printInvoice,icon:const Icon(Icons.picture_as_pdf_outlined),label:const Text('VIEW / PRINT PDF'))
      ])
    )
  );
}
class ProfilePage extends StatefulWidget { const ProfilePage({super.key}); @override State<ProfilePage> createState()=>_ProfilePageState(); }
class _ProfilePageState extends State<ProfilePage>{
  final service=CustomerService(Supabase.instance.client); Map<String,dynamic>? customer;
  @override void initState(){super.initState();load();} Future<void> load()async{final c=await service.customer();if(mounted)setState(()=>customer=c);}
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Profile')),body:ListView(padding:const EdgeInsets.all(18),children:[
    const CircleAvatar(radius:42,child:Icon(Icons.person_outline,size:42)),const SizedBox(height:14),
    Center(child:Text(customer?['name']?.toString()??'Customer',style:const TextStyle(fontSize:23,fontWeight:FontWeight.w900))),
    Center(child:Text(customer?['customer_code']?.toString()??'',style:const TextStyle(color:Colors.black54))),const SizedBox(height:24),
    Card(child:Column(children:[
      ListTile(leading:const Icon(Icons.phone_outlined),title:const Text('Mobile'),subtitle:Text(customer?['mobile']?.toString()??'-')),
      ListTile(leading:const Icon(Icons.business_outlined),title:const Text('Company'),subtitle:Text(customer?['company_name']?.toString()??'-')),
      ListTile(leading:const Icon(Icons.location_on_outlined),title:const Text('Address'),subtitle:Text(customer?['address']?.toString()??'-'))
    ])),const SizedBox(height:12),
    ListTile(leading:const Icon(Icons.settings_outlined),title:const Text('Settings'),onTap:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>const SettingsPage())))
  ]));
}
class SettingsPage extends StatefulWidget { const SettingsPage({super.key}); @override State<SettingsPage> createState()=>_SettingsPageState(); }
class _SettingsPageState extends State<SettingsPage>{
  bool remember=true,notifications=true;String language='English';
  @override void initState(){super.initState();load();} Future<void> load()async{final p=await SharedPreferences.getInstance();if(mounted)setState((){remember=p.getBool('remember_me')??true;language=p.getString('language')??'English';notifications=p.getBool('notifications')??true;});}
  Future<void> save(String k,dynamic v)async{final p=await SharedPreferences.getInstance();if(v is bool)await p.setBool(k,v);if(v is String)await p.setString(k,v);}
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Settings')),body:ListView(children:[
    SwitchListTile(title:const Text('Remember Me'),subtitle:const Text('Keep me signed in for 15 days'),value:remember,onChanged:(v){setState(()=>remember=v);save('remember_me',v);}),
    SwitchListTile(title:const Text('Notifications'),subtitle:const Text('Service and payment updates'),value:notifications,onChanged:(v)async{setState(()=>notifications=v);await save('notifications',v);try{await PushNotificationService(Supabase.instance.client).setNotificationsEnabled(v);}catch(_){}}),
    ListTile(title:const Text('Language'),subtitle:Text(language),onTap:()async{final v=await showDialog<String>(context:context,builder:(_)=>SimpleDialog(title:const Text('Language'),children:[SimpleDialogOption(onPressed:()=>Navigator.pop(context,'English'),child:const Text('English')),SimpleDialogOption(onPressed:()=>Navigator.pop(context,'Marathi'),child:const Text('Marathi'))]));if(v!=null){setState(()=>language=v);save('language',v);}}),
    const Divider(),ListTile(leading:const Icon(Icons.phone_outlined),title:const Text('Call Unique Market'),subtitle:const Text('7350060071')),
    ListTile(leading:const Icon(Icons.logout_outlined),title:const Text('Logout'),onTap:()async{await Supabase.instance.client.auth.signOut();if(context.mounted)Navigator.pushAndRemoveUntil(context,MaterialPageRoute(builder:(_)=>const LoginPage()),(_)=>false);})
  ]));
}
