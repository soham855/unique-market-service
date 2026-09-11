import 'package:flutter/material.dart';

void main() {
  runApp(const InstantServicesApp());
}

class InstantServicesApp extends StatelessWidget {
  const InstantServicesApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Instant Services for Your Security',
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF070A0F),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF22D3EE),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const AppHome(),
    );
  }
}

class AppHome extends StatefulWidget {
  const AppHome({super.key});

  @override
  State<AppHome> createState() => _AppHomeState();
}

class _AppHomeState extends State<AppHome> {
  int index = 0;

  @override
  Widget build(BuildContext context) {
    final pages = [
      const HomePage(),
      const Center(child: Text('Complaints', style: TextStyle(fontSize: 22))),
      const Center(child: Text('Payments', style: TextStyle(fontSize: 22))),
      const Center(child: Text('Profile', style: TextStyle(fontSize: 22))),
    ];

    return Scaffold(
      body: SafeArea(child: pages[index]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => setState(() => index = value),
        backgroundColor: const Color(0xFF0C1118),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.confirmation_number_outlined), selectedIcon: Icon(Icons.confirmation_number), label: 'Complaints'),
          NavigationDestination(icon: Icon(Icons.qr_code_2_outlined), selectedIcon: Icon(Icons.qr_code_2), label: 'Payments'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
      children: [
        Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                gradient: const LinearGradient(colors: [Color(0xFF22D3EE), Color(0xFF2563EB)]),
              ),
              child: const Icon(Icons.shield_outlined, color: Colors.white),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Instant Services', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                  Text('Your security, connected.', style: TextStyle(color: Colors.white54)),
                ],
              ),
            ),
            const Icon(Icons.notifications_none_rounded, color: Colors.white70),
          ],
        ),
        const SizedBox(height: 28),
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF102A38), Color(0xFF0D1722)],
            ),
            border: Border.all(color: Colors.white10),
          ),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('SECURITY SERVICE', style: TextStyle(color: Color(0xFF67E8F9), fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1.4)),
              SizedBox(height: 8),
              Text('Need technical help?', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
              SizedBox(height: 8),
              Text('Raise a service request and track your technician in real time.', style: TextStyle(color: Colors.white60, height: 1.4)),
              SizedBox(height: 18),
              _PrimaryButton(),
            ],
          ),
        ),
        const SizedBox(height: 24),
        const Text('Quick access', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        const Row(
          children: [
            Expanded(child: _QuickCard(icon: Icons.add_task_rounded, title: 'Raise Request')),
            SizedBox(width: 12),
            Expanded(child: _QuickCard(icon: Icons.location_on_outlined, title: 'Track Service')),
          ],
        ),
      ],
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton();
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
    decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), color: const Color(0xFF22D3EE)),
    child: const Row(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.add, color: Color(0xFF031018)), SizedBox(width: 8), Text('Raise Complaint', style: TextStyle(color: Color(0xFF031018), fontWeight: FontWeight.w800))]),
  );
}

class _QuickCard extends StatelessWidget {
  final IconData icon;
  final String title;
  const _QuickCard({required this.icon, required this.title});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(color: const Color(0xFF0D131C), borderRadius: BorderRadius.circular(18), border: Border.all(color: Colors.white10)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Icon(icon, color: const Color(0xFF67E8F9)), const SizedBox(height: 20), Text(title, style: const TextStyle(fontWeight: FontWeight.w700))]),
  );
}
