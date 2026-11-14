import 'package:flutter/material.dart';
import 'instant_theme.dart';

/// Compact role-specific dashboard banner shared by all three APKs.
class InstantDashboardBanner extends StatelessWidget {
  final String eyebrow;
  final String title;
  final String subtitle;
  final IconData icon;
  const InstantDashboardBanner({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.subtitle,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: InstantTheme.green,
      borderRadius: BorderRadius.circular(24),
    ),
    child: Row(children: [
      Expanded(child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(eyebrow, style: const TextStyle(
            color: InstantTheme.yellow,
            fontSize: 12, fontWeight: FontWeight.w800,
            letterSpacing: 1.1,
          )),
          const SizedBox(height: 8),
          Text(title, style: const TextStyle(
            color: Colors.white, fontSize: 23,
            fontWeight: FontWeight.w900,
          )),
          const SizedBox(height: 6),
          Text(subtitle, style: const TextStyle(
            color: Color(0xFFE1F2E8), fontSize: 13,
          )),
        ],
      )),
      const SizedBox(width: 10),
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: InstantTheme.yellow,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Icon(icon, size: 30, color: InstantTheme.ink),
      ),
    ]),
  );
}
