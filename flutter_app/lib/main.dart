import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:geolocator/geolocator.dart';
import 'config/supabase_config.dart';
import 'services/auth_service.dart';
import 'services/customer_service.dart';

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

class SessionGate extends StatelessWidget {
  const SessionGate({super.key});
  @override
  Widget build(BuildContext context) => Supabase.instance.client.auth.currentSession == null
      ? const LoginPage()
      : const CustomerHomePage();
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

  @override void initState() { super.initState(); load(); }
  Future<void> load() async {
    try {
      customer = await service.customer();
      tickets = await service.tickets();
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }
  Future<void> logout() async {
    await Supabase.instance.client.auth.signOut();
    if (mounted) Navigator.pushAndRemoveUntil(context, MaterialPageRoute(builder: (_) => const LoginPage()), (_) => false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Unique Market', style: TextStyle(fontWeight: FontWeight.w800)), actions: [IconButton(onPressed: load, icon: const Icon(Icons.refresh)), PopupMenuButton<String>(onSelected: (v) { if (v == 'logout') logout(); }, itemBuilder: (_) => const [PopupMenuItem(value: 'logout', child: Text('Logout'))])]),
    body: RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(18), children: [
      Text('Namaskar, ' + (customer?['name']?.toString() ?? 'Customer'), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
      Text(customer?['customer_code']?.toString() ?? 'Customer Portal', style: const TextStyle(color: Colors.black54)),
      const SizedBox(height: 22),
      Row(children: [
        Expanded(child: _homeCard(Icons.add_circle_outline, 'Raise Complaint', () async { await Navigator.push(context, MaterialPageRoute(builder: (_) => const RaiseComplaintPage())); load(); })),
        const SizedBox(width: 12),
        Expanded(child: _homeCard(Icons.confirmation_num_outlined, 'My Tickets', () => Navigator.push(context, MaterialPageRoute(builder: (_) => TicketListPage(tickets: tickets))))),
      ]),
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
    ], onDestinationSelected: (i) { if (i == 1) Navigator.push(context, MaterialPageRoute(builder: (_) => TicketListPage(tickets: tickets))); }),
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
    body: ListView.builder(padding: const EdgeInsets.all(16), itemCount: tickets.length, itemBuilder: (_, i) => TicketTile(ticket: tickets[i])),
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
    ),
  );
}
