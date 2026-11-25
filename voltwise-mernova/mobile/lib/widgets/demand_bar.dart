import 'package:flutter/material.dart';

import '../core/engine.dart';
import '../core/format.dart';
import '../theme.dart';

/// Horizontal bar per equipment group — the mobile version of the web chart.
class DemandBars extends StatelessWidget {
  const DemandBars({super.key, required this.rows});

  final List<BreakdownRow> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return const Text('Add loads to see the demand split.',
          style: TextStyle(color: VoltColors.muted, fontSize: 12));
    }
    final sorted = [...rows]..sort((a, b) => b.load.demandKw.compareTo(a.load.demandKw));
    final maxKw = sorted.first.load.demandKw == 0 ? 1.0 : sorted.first.load.demandKw;

    return Column(
      children: [
        for (final row in sorted)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              children: [
                SizedBox(
                  width: 108,
                  child: Text(
                    row.load.name,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11, color: Color(0xFFB8C7D9)),
                  ),
                ),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(99),
                    child: LinearProgressIndicator(
                      value: (row.load.demandKw / maxKw).clamp(0.02, 1.0).toDouble(),
                      minHeight: 9,
                      backgroundColor: const Color(0x1AA4BEDC),
                      valueColor: const AlwaysStoppedAnimation(VoltColors.cyan),
                    ),
                  ),
                ),
                SizedBox(
                  width: 46,
                  child: Text(
                    fmtNum(row.load.demandKw, digits: 1),
                    textAlign: TextAlign.right,
                    style: const TextStyle(fontSize: 10, color: VoltColors.muted),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
