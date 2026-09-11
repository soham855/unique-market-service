import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'config/supabase_config.dart';
import 'services/auth_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (SupabaseConfig.isConfigured) {
    await Supabase.initialize(url: SupabaseConfig.url, anonKey: SupabaseConfig.anonKey);
  }
  runApp(const InstantServicesApp());
}

class InstantServicesApp extends StatelessWidget {
  const InstantServicesApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Instant Services for Your Security',
    theme: ThemeData(brightness: Brightness.dark, scaffoldBackgroundColor: const Color(0xFF070A0F), colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF22D3EE), brightness: Brightness.dark), useMaterial3: true),
    home: const AuthGate(),
  );
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
  @override State<LoginPage> createState() => _LoginPageState();
}
class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool loading = false;
  String? error;
  Future<void> login() async {
    setState(() { loading = true; error = null; });
    try {
      if (!SupabaseConfig.isConfigured) throw Exception('Supabase is not configured. Build with SUPABASE_ANON_KEY.');
      await AuthService(Supabase.instance.client).signIn(email: email.text, password: password.text);
      if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const RoleGate()));
    } on AuthException catch (e) { setState(() => error = e.message); }
    catch (e) { setState(() => error = e.toString().replaceFirst('Exception: ', '')); }
    finally { if (mounted) setState(() => loading = false); }
  }
  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 430), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    const Icon(Icons.shield_rounded, size: 52, color: Color(0xFF22D3EE)),
    const SizedBox(height: 20), const Text('Instant Services', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900)),
    const SizedBox(height: 6), const Text('Secure access to your service portal', style: TextStyle(color: Colors.white60)),
    const SizedBox(height: 34),
    TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.email_outlined), border: OutlineInputBorder())),
    const SizedBox(height: 14), TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password', prefixIcon: Icon(Icons.lock_outline), border: OutlineInputBorder())),
    if (error != null) ...[const SizedBox(height: 12), Text(error!, style: const TextStyle(color: Colors.redAccent))],
    const SizedBox(height: 20), SizedBox(width: double.infinity, height: 52, child: FilledButton(onPressed: loading ? null : login, child: loading ? const CircularProgressIndicator() : const Text('LOGIN', style: TextStyle(fontWeight: FontWeight.w800)))),
  ]))));
}

class RoleGate extends StatefulWidget {
  const RoleGate({super.key});
  @override State<RoleGate> createState() => _RoleGateState();
}
class _RoleGateState extends State<RoleGate> {
  String? role; String? error;
  @override void initState() { super.initState(); resolve(); }
  Future<void> resolve() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) { if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const LoginPage())); return; }
      final r = await AuthService(Supabase.instance.client).resolveRole(user.id);
      if (mounted) setState(() => role = r ?? 'customer');
    } catch (e) { if (mounted) setState(() => error = e.toString()); }
  }
  @override Widget build(BuildContext context) {
    if (error != null) return Scaffold(body: Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(error!))));
    if (role == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (role == 'admin') return const RoleHome(title: 'Admin Dashboard', icon: Icons.admin_panel_settings_rounded);
    if (role == 'technician') return const RoleHome(title: 'Technician Portal', icon: Icons.engineering_rounded);
    return const RoleHome(title: 'Customer Dashboard', icon: Icons.person_rounded);
  }
}

class RoleHome extends StatelessWidget {
  final String title; final IconData icon;
  const RoleHome({super.key, required this.title, required this.icon});
  Future<void> logout(BuildContext context) async { await Supabase.instance.client.auth.signOut(); if (context.mounted) Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginPage()), (_) => false); }
  @override Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)), actions: [IconButton(onPressed: () => logout(context), icon: const Icon(Icons.logout))]),
    body: ListView(padding: const EdgeInsets.all(20), children: [
      Container(padding: const EdgeInsets.all(22), decoration: BoxDecoration(borderRadius: BorderRadius.circular(24), gradient: const LinearGradient(colors: [Color(0xFF102A38), Color(0xFF0D1722)]), border: Border.all(color: Colors.white10)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Icon(icon, color: const Color(0xFF67E8F9), size: 36), const SizedBox(height: 16), Text(title, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)), const SizedBox(height: 8), const Text('Connected to Unique Market Service backend.', style: TextStyle(color: Colors.white60))]),
      const SizedBox(height: 18),
      const _ActionCard(icon: Icons.confirmation_number_outlined, title: 'Complaints', subtitle: 'Raise and track service complaints'),
      const _ActionCard(icon: Icons.payments_outlined, title: 'Payments', subtitle: 'View payment and UTR status'),
      const _ActionCard(icon: Icons.person_outline, title: 'Profile', subtitle: 'View your account details'),
    ]),
  );
}
class _ActionCard extends StatelessWidget {
  final IconData icon; final String title, subtitle;
  const _ActionCard({required this.icon, required this.title, required this.subtitle});
  @override Widget build(BuildContext context) => Card(color: const Color(0xFF0D131C), child: ListTile(contentPadding: const EdgeInsets.all(10), leading: CircleAvatar(backgroundColor: const Color(0xFF12313B), child: Icon(icon, color: const Color(0xFF67E8F9))), title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)), subtitle: Text(subtitle, style: const TextStyle(color: Colors.white54))));
}
