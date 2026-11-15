import 'package:flutter/material.dart';
import 'instant_theme.dart';

/// Consistent tappable action tile for role-specific dashboard shortcuts.
class InstantQuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const InstantQuickAction({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    borderRadius: BorderRadius.circular(18),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 14),
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFFE7ECE5)),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF2B6),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: InstantTheme.green, size: 26),
          ),
          const SizedBox(height: 9),
          Text(label, maxLines: 2, textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
        ]),
      ),
    ),
  );
}
