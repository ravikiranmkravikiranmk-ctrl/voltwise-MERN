import 'package:flutter/material.dart';

/// Voltwise dark palette — matches the React client and the original design.
class VoltColors {
  static const ink = Color(0xFFEAF1FB);
  static const muted = Color(0xFF91A2B9);
  static const panel = Color(0xFF111E30);
  static const panelAlt = Color(0xFF17283D);
  static const field = Color(0xFF14263A);
  static const line = Color(0x24A4BEDC);
  static const cyan = Color(0xFF56D6D0);
  static const lime = Color(0xFFB8EF75);
  static const danger = Color(0xFFFF8F8F);
  static const background = Color(0xFF0B1727);
}

ThemeData buildTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: VoltColors.background,
    colorScheme: base.colorScheme.copyWith(
      primary: VoltColors.cyan,
      secondary: VoltColors.lime,
      surface: VoltColors.panel,
      error: VoltColors.danger,
    ),
    textTheme: base.textTheme.apply(
      bodyColor: VoltColors.ink,
      displayColor: VoltColors.ink,
    ),
    sliderTheme: base.sliderTheme.copyWith(
      activeTrackColor: VoltColors.cyan,
      inactiveTrackColor: const Color(0x24A4BEDC),
      thumbColor: VoltColors.cyan,
      overlayColor: const Color(0x2256D6D0),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: VoltColors.field,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFF2A4058)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFF2A4058)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: VoltColors.cyan),
      ),
      labelStyle: const TextStyle(color: VoltColors.muted, fontSize: 12),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: VoltColors.panelAlt,
      contentTextStyle: TextStyle(color: VoltColors.ink),
      behavior: SnackBarBehavior.floating,
    ),
  );
}

/// Shared card chrome.
class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding = const EdgeInsets.all(16)});

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: VoltColors.panel.withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: VoltColors.line),
      ),
      child: child,
    );
  }
}

/// Small uppercase monospace label.
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.color = VoltColors.muted, this.size = 10});

  final String text;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: TextStyle(
        color: color,
        fontSize: size,
        letterSpacing: 1.8,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}

class SectionHead extends StatelessWidget {
  const SectionHead({super.key, required this.number, required this.title, this.sub});

  final String number;
  final String title;
  final String? sub;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 22, bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              border: Border.all(color: const Color(0x4D56D6D0)),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(number, style: const TextStyle(color: VoltColors.cyan, fontSize: 11)),
          ),
          const SizedBox(width: 10),
          Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          if (sub != null) ...[
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                sub!,
                style: const TextStyle(color: VoltColors.muted, fontSize: 11),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
