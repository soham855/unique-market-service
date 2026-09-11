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
  const _ActionCard({required this.icon, required this.title, required this.subtitle});
  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFF0D131C),
      child: ListTile(
        contentPadding: const EdgeInsets.all(10),
        leading: CircleAvatar(backgroundColor: const Color(0xFF12313B), child: Icon(icon, color: const Color(0xFF67E8F9))),
        title: Text(tr(context, title), style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(tr(context, subtitle), style: const TextStyle(color: Colors.white54)),
      ),
    );
  }
}
