import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'config/supabase_config.dart';
import 'services/auth_service.dart';
import 'app_localizations.dart';

final ValueNotifier<Locale> appLocale = ValueNotifier(const Locale('en'));

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final savedLanguage = prefs.getString('language') ?? 'en';
  appLocale.value = Locale(savedLanguage == 'mr' ? 'mr' : 'en');
  if (SupabaseConfig.isConfigured) {
    await Supabase.initialize(
      url: SupabaseConfig.url,
      publishableKey: SupabaseConfig.publishableKey,
    );
  }
  runApp(const InstantServicesApp());
}

Future<void> setAppLanguage(String code) async {
  appLocale.value = Locale(code == 'mr' ? 'mr' : 'en');
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('language', appLocale.value.languageCode);
}

class InstantServicesApp extends StatelessWidget {
  const InstantServicesApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Locale>(
      valueListenable: appLocale,
      builder: (_, locale, __) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: tr(context, 'Instant Services for Your Security'),
        locale: locale,
        supportedLocales: const [Locale('en'), Locale('mr')],
        theme: ThemeData(
          brightness: Brightness.dark,
          scaffoldBackgroundColor: const Color(0xFF070A0F),
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF22D3EE),
            brightness: Brightness.dark,
          ),
          useMaterial3: true,
        ),
        home: const AuthGate(),
      ),
    );
  }
}

class LanguageToggle extends StatelessWidget {
  const LanguageToggle({super.key});

  @override
  Widget build(BuildContext context) {
    final isMr = appLocale.value.languageCode == 'mr';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(.06),
        borderRadius: BorderRadius.circular(30),
        border: Border.all(color: Colors.white10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _langButton(context, 'EN', !isMr, 'en'),
          _langButton(context, 'मराठी', isMr, 'mr'),
        ],
      ),
    );
  }

  Widget _langButton(BuildContext context, String label, bool active, String code) {
    return InkWell(
      borderRadius: BorderRadius.circular(22),
      onTap: () => setAppLanguage(code),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
        decoration: BoxDecoration(
          color: active ? const Color(0xFF12313B) : Colors.transparent,
          borderRadius: BorderRadius.circular(22),
        ),
        child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: active ? const Color(0xFF67E8F9) : Colors.white54)),
      ),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    if (!SupabaseConfig.isConfigured) return const LoginPage();
    final session = Supabase.instance.client.auth.currentSession;
    return session == null ? const LoginPage() : const RoleGate();
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool loading = false;
  String? error;

  Future<void> login() async {
    setState(() { loading = true; error = null; });
    try {
      if (!SupabaseConfig.isConfigured) throw Exception(tr(context, 'Supabase is not configured.'));
      await AuthService(Supabase.instance.client).signIn(email: email.text, password: password.text);
      if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const RoleGate()));
    } on AuthException catch (e) {
      setState(() => error = e.message);
    } catch (e) {
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  void dispose() { email.dispose(); password.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 430),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.shield_rounded, size: 52, color: Color(0xFF22D3EE)),
                      const SizedBox(height: 20),
                      Text(tr(context, 'Instant Services'), style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 6),
                      Text(tr(context, 'Secure access to your service portal'), style: const TextStyle(color: Colors.white60)),
                      const SizedBox(height: 34),
                      TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: tr(context, 'Email'), prefixIcon: const Icon(Icons.email_outlined), border: const OutlineInputBorder())),
                      const SizedBox(height: 14),
                      TextField(controller: password, obscureText: true, decoration: InputDecoration(labelText: tr(context, 'Password'), prefixIcon: const Icon(Icons.lock_outline), border: const OutlineInputBorder())),
                      if (error != null) ...[const SizedBox(height: 12), Text(error!, style: const TextStyle(color: Colors.redAccent))],
                      const SizedBox(height: 20),
                      SizedBox(width: double.infinity, height: 52, child: FilledButton(onPressed: loading ? null : login, child: loading ? const CircularProgressIndicator() : Text(tr(context, 'LOGIN'), style: const TextStyle(fontWeight: FontWeight.w800)))),
                    ],
                  ),
                ),
              ),
            ),
            const Positioned(top: 14, right: 14, child: LanguageToggle()),
          ],
        ),
      ),
    );
  }
}

class RoleGate extends StatefulWidget {
  const RoleGate({super.key});
  @override
  State<RoleGate> createState() => _RoleGateState();
}

class _RoleGateState extends State<RoleGate> {
  String? role;
  String? error;
  @override
  void initState() { super.initState(); resolve(); }
  Future<void> resolve() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) {
        if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const LoginPage()));
        return;
      }
      final resolved = await AuthService(Supabase.instance.client).resolveRole(user.id);
      if (mounted) setState(() => role = resolved ?? 'customer');
    } catch (e) { if (mounted) setState(() => error = e.toString()); }
  }

  @override
  Widget build(BuildContext context) {
    if (error != null) return Scaffold(body: Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(error!))));
    if (role == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (role == 'admin') return const RoleHome(title: 'Admin Dashboard', icon: Icons.admin_panel_settings_rounded);
    if (role == 'technician') return const RoleHome(title: 'Technician Portal', icon: Icons.engineering_rounded);
    return const RoleHome(title: 'Customer Dashboard', icon: Icons.person_rounded);
  }
}

class RoleHome extends StatelessWidget {
  final String title;
  final IconData icon;
  const RoleHome({super.key, required this.title, required this.icon});

  Future<void> logout(BuildContext context) async {
    await Supabase.instance.client.auth.signOut();
    if (context.mounted) Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginPage()), (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(tr(context, title), style: const TextStyle(fontWeight: FontWeight.w800)),
        actions: [const LanguageToggle(), IconButton(onPressed: () => logout(context), icon: const Icon(Icons.logout))],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(24), gradient: const LinearGradient(colors: [Color(0xFF102A38), Color(0xFF0D1722)]), border: Border.all(color: Colors.white10)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(icon, color: const Color(0xFF67E8F9), size: 36),
              const SizedBox(height: 16),
              Text(tr(context, title), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Text(tr(context, 'Connected to Unique Market Service backend.'), style: const TextStyle(color: Colors.white60)),
            ]),
          ),
          const SizedBox(height: 18),
          _ActionCard(icon: Icons.confirmation_number_outlined, title: 'Live Service Requests', subtitle: 'View and track live service requests', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LiveServiceRequestsPage()))),
          _ActionCard(icon: Icons.confirmation_number_outlined, title: 'Complaints', subtitle: 'Raise and track service complaints'),
          _ActionCard(icon: Icons.payments_outlined, title: 'Payments', subtitle: 'View payment and UTR status'),
          _ActionCard(icon: Icons.person_outline, title: 'Profile', subtitle: 'View your account details'),
        ],
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  const _ActionCard({required this.icon, required this.title, required this.subtitle, this.onTap});
  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFF0D131C),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(backgroundColor: const Color(0xFF12313B), child: Icon(icon, color: const Color(0xFF67E8F9))),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(tr(context, title), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text(tr(context, subtitle), maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white54)),
              ])),
              if (onTap != null) const Padding(padding: EdgeInsets.only(left: 8, top: 6), child: Icon(Icons.chevron_right, color: Colors.white38)),
            ],
          ),
        ),
      ),
    );
  }
}

class LiveServiceRequestsPage extends StatefulWidget {
  const LiveServiceRequestsPage({super.key});
  @override
  State<LiveServiceRequestsPage> createState() => _LiveServiceRequestsPageState();
}

class _LiveServiceRequestsPageState extends State<LiveServiceRequestsPage> {
  List<Map<String, dynamic>> requests = [];
  bool loading = true;
  String? error;
  Timer? timer;

  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 10), (_) => load(silent: true));
  }

  Future<void> load({bool silent = false}) async {
    if (!silent && mounted) setState(() { loading = true; error = null; });
    try {
      final response = await Supabase.instance.client
          .from('complaints')
          .select('id,complaint_no,ticket_no,customer_id,category,description,priority,status,technician_id,scheduled_visit_date,service_type,location_text,created_at')
          .order('created_at', ascending: false)
          .limit(100);
      if (mounted) setState(() { requests = List<Map<String, dynamic>>.from(response); loading = false; });
    } catch (e) {
      if (mounted) setState(() { error = e.toString().replaceFirst('Exception: ', ''); loading = false; });
    }
  }

  @override
  void dispose() { timer?.cancel(); super.dispose(); }

  Color statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'complete':
      case 'completed':
      case 'closed':
        return Colors.greenAccent;
      case 'in_progress':
      case 'in progress':
      case 'assigned':
        return Colors.amberAccent;
      default:
        return const Color(0xFF67E8F9);
    }
  }

  Widget meta(String label, String value) {
    if (value.trim().isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
      decoration: BoxDecoration(color: Colors.white.withOpacity(.045), borderRadius: BorderRadius.circular(10)),
      child: Text('$label: $value', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Colors.white70)),
    );
  }

  Widget requestCard(Map<String, dynamic> r) {
    final number = (r['complaint_no'] ?? r['ticket_no'] ?? r['id'] ?? '').toString();
    final status = (r['status'] ?? 'open').toString();
    final priority = (r['priority'] ?? '').toString();
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      color: const Color(0xFF0D131C),
      clipBehavior: Clip.antiAlias,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(border: Border(left: BorderSide(color: statusColor(status), width: 3))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Text(number, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900))),
            const SizedBox(width: 8),
            Flexible(child: Align(alignment: Alignment.topRight, child: Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5), decoration: BoxDecoration(color: statusColor(status).withOpacity(.12), borderRadius: BorderRadius.circular(20)), child: Text(status.toUpperCase(), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: statusColor(status))))))
          ]),
          if ((r['description'] ?? '').toString().trim().isNotEmpty) ...[
            const SizedBox(height: 9),
            Text(r['description'].toString(), maxLines: 4, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70, height: 1.35)),
          ],
          const SizedBox(height: 11),
          Wrap(spacing: 7, runSpacing: 7, children: [
            meta('Type', (r['service_type'] ?? r['category'] ?? '').toString()),
            meta('Priority', priority),
            meta('Visit', (r['scheduled_visit_date'] ?? '').toString()),
            meta('Location', (r['location_text'] ?? '').toString()),
          ]),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(tr(context, 'Live Service Requests'), style: const TextStyle(fontWeight: FontWeight.w800)),
        actions: [IconButton(onPressed: load, tooltip: 'Refresh', icon: const Icon(Icons.refresh))],
      ),
      body: RefreshIndicator(
        onRefresh: load,
        child: loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 28),
                children: [
                  Container(
                    padding: const EdgeInsets.all(14),
                    margin: const EdgeInsets.only(bottom: 14),
                    decoration: BoxDecoration(color: const Color(0xFF102A38), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
                    child: Row(children: [
                      const Icon(Icons.sync_rounded, color: Color(0xFF67E8F9)),
                      const SizedBox(width: 10),
                      Expanded(child: Text(tr(context, 'Live requests refresh automatically every 10 seconds.'), style: const TextStyle(color: Colors.white70))),
                    ]),
                  ),
                  if (error != null) Padding(padding: const EdgeInsets.all(12), child: Text(error!, style: const TextStyle(color: Colors.redAccent))),
                  if (requests.isEmpty && error == null) Padding(padding: const EdgeInsets.all(30), child: Center(child: Text(tr(context, 'No live service requests found.'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white54)))),
                  ...requests.map(requestCard),
                ],
              ),
      ),
    );
  }
}
