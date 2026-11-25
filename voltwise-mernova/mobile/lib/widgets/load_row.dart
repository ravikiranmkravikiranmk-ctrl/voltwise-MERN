import 'package:flutter/material.dart';

import '../core/engine.dart';
import '../theme.dart';

/// One editable load in the schedule.
class LoadRow extends StatefulWidget {
  const LoadRow({
    super.key,
    required this.load,
    required this.onChanged,
    required this.onRemove,
  });

  final LoadSpec load;
  final ValueChanged<LoadSpec> onChanged;
  final VoidCallback onRemove;

  @override
  State<LoadRow> createState() => _LoadRowState();
}

class _LoadRowState extends State<LoadRow> {
  late TextEditingController _name;
  late TextEditingController _quantity;
  late TextEditingController _ratedKw;
  late TextEditingController _pf;
  late TextEditingController _df;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.load.name);
    _quantity = TextEditingController(text: '${widget.load.quantity}');
    _ratedKw = TextEditingController(text: _trim(widget.load.ratedKw));
    _pf = TextEditingController(text: _trim(widget.load.powerFactor));
    _df = TextEditingController(text: _trim(widget.load.demandFactor));
  }

  static String _trim(double value) =>
      value == value.roundToDouble() ? value.toStringAsFixed(0) : value.toString();

  @override
  void dispose() {
    _name.dispose();
    _quantity.dispose();
    _ratedKw.dispose();
    _pf.dispose();
    _df.dispose();
    super.dispose();
  }

  void _emit({
    String? name,
    int? quantity,
    double? ratedKw,
    double? powerFactor,
    double? demandFactor,
    int? phases,
  }) {
    widget.onChanged(widget.load.copyWith(
      name: name,
      quantity: quantity,
      ratedKw: ratedKw,
      powerFactor: powerFactor,
      demandFactor: demandFactor,
      phases: phases,
    ));
  }

  Widget _field(String label, TextEditingController controller, ValueChanged<String> onSubmitted, {int flex = 3}) {
    return Expanded(
      flex: flex,
      child: Padding(
        padding: const EdgeInsets.only(right: 8),
        child: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          style: const TextStyle(fontSize: 13),
          decoration: InputDecoration(labelText: label, labelStyle: const TextStyle(fontSize: 11)),
          onChanged: onSubmitted,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 12),
      decoration: BoxDecoration(
        color: VoltColors.panelAlt.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: VoltColors.line),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _name,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                  decoration: const InputDecoration(labelText: 'Equipment / load'),
                  onChanged: (value) => _emit(name: value),
                ),
              ),
              IconButton(
                tooltip: 'Remove load',
                onPressed: widget.onRemove,
                icon: const Icon(Icons.close, size: 18, color: VoltColors.danger),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _field('Qty', _quantity, (v) => _emit(quantity: int.tryParse(v) ?? widget.load.quantity), flex: 2),
              _field('Rated kW', _ratedKw, (v) => _emit(ratedKw: double.tryParse(v) ?? widget.load.ratedKw)),
              _field('PF', _pf, (v) => _emit(powerFactor: double.tryParse(v) ?? widget.load.powerFactor), flex: 2),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _field('Demand factor', _df, (v) => _emit(demandFactor: double.tryParse(v) ?? widget.load.demandFactor), flex: 3),
              Expanded(
                flex: 2,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(left: 2, bottom: 4),
                      child: Text('Phase', style: TextStyle(fontSize: 11, color: VoltColors.muted)),
                    ),
                    Container(
                      height: 42,
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      decoration: BoxDecoration(
                        color: VoltColors.field,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFF2A4058)),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<int>(
                          value: widget.load.phases,
                          isExpanded: true,
                          dropdownColor: VoltColors.panelAlt,
                          style: const TextStyle(fontSize: 13, color: VoltColors.ink),
                          items: const [
                            DropdownMenuItem(value: 1, child: Text('1-phase')),
                            DropdownMenuItem(value: 3, child: Text('3-phase')),
                          ],
                          onChanged: (value) => _emit(phases: value ?? widget.load.phases),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Connected ${widget.load.connectedKw.toStringAsFixed(1)} kW · '
              'Demand ${widget.load.demandKw.toStringAsFixed(1)} kW',
              style: const TextStyle(fontSize: 10.5, color: VoltColors.muted),
            ),
          ),
        ],
      ),
    );
  }
}
