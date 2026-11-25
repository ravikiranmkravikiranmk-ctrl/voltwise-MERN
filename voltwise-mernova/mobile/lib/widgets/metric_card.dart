import 'package:flutter/material.dart';

import '../theme.dart';

class MetricCard extends StatelessWidget {
  const MetricCard({
    super.key,
    required this.label,
    required this.value,
    this.unit,
    this.foot,
  });

  final String label;
  final String value;
  final String? unit;
  final String? foot;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xE617283D), Color(0xD90E1B2B)],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: VoltColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Eyebrow(label, size: 9),
          const SizedBox(height: 6),
          RichText(
            text: TextSpan(
              text: value,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: Color(0xFFF2F8FF),
                letterSpacing: -0.6,
              ),
              children: [
                if (unit != null)
                  TextSpan(
                    text: ' $unit',
                    style: const TextStyle(fontSize: 12, color: VoltColors.muted, fontWeight: FontWeight.w600),
                  ),
              ],
            ),
          ),
          if (foot != null) ...[
            const SizedBox(height: 2),
            Text(foot!, style: const TextStyle(fontSize: 10, color: Color(0xFF8DA2B9))),
          ],
        ],
      ),
    );
  }
}

class ResultHighlight extends StatelessWidget {
  const ResultHighlight({
    super.key,
    required this.eyebrow,
    required this.headline,
    this.sub,
  });

  final String eyebrow;
  final String headline;
  final String? sub;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0x59294431), Color(0xCC122630)],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0x45B8EF75)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Eyebrow(eyebrow, size: 9, color: VoltColors.muted),
          const SizedBox(height: 4),
          Text(
            headline,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: Color(0xFFF2F8FF),
              letterSpacing: -0.6,
            ),
          ),
          if (sub != null) ...[
            const SizedBox(height: 3),
            Text(sub!, style: const TextStyle(fontSize: 11, color: Color(0xFFB7C9D9))),
          ],
        ],
      ),
    );
  }
}
