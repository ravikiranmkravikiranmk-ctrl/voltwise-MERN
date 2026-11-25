import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/engine.dart';
import '../core/format.dart';
import '../state/estimator_controller.dart';
import '../theme.dart';
import '../widgets/demand_bar.dart';
import '../widgets/load_row.dart';
import '../widgets/metric_card.dart';

/// The single-screen workspace: schedule in, sized equipment out.
class StudioScreen extends StatefulWidget {
  const StudioScreen({super.key, required this.controller});

  final EstimatorController controller;

  @override
  State<StudioScreen> createState() => _StudioScreenState();
}

class _StudioScreenState extends State<StudioScreen> {
  @override
  void initState() {
    super.initState();
    widget.controller.refreshProjects();
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _copySchedule() async {
    final controller = widget.controller;
    final json = '{"loads": [${controller.loads.map((l) => l.toJson()).join(', ')}]}';
    await Clipboard.setData(ClipboardData(text: json));
    _toast('Schedule JSON copied to the clipboard');
  }

  void _showProjects(EstimatorController controller) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: VoltColors.panel,
      showDragHandle: true,
      builder: (context) => AnimatedBuilder(
        animation: controller,
        builder: (context, _) {
          final projects = controller.projects;
          return Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Eyebrow('Saved projects'),
                const SizedBox(height: 12),
                if (projects.isEmpty)
                  const Text(
                    'No saved projects. Start the API and save this schedule first.',
                    style: TextStyle(color: VoltColors.muted, fontSize: 12),
                  ),
                for (final project in projects)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(project.name, style: const TextStyle(fontSize: 14)),
                    subtitle: Text(
                      '${project.loads.length} loads',
                      style: const TextStyle(fontSize: 11, color: VoltColors.muted),
                    ),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_outline, size: 18, color: VoltColors.danger),
                      onPressed: () => controller.deleteProject(project),
                    ),
                    onTap: () {
                      controller.openProject(project);
                      Navigator.of(context).pop();
                    },
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final controller = widget.controller;
        final report = controller.report;

        return Scaffold(
          appBar: AppBar(
            backgroundColor: Colors.transparent,
            elevation: 0,
            titleSpacing: 16,
            title: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Eyebrow('Voltwise / Load Studio', size: 9),
                Text('Electrical Load & Cable Sizing',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              ],
            ),
            actions: [
              IconButton(
                tooltip: 'Saved projects',
                onPressed: () => _showProjects(controller),
                icon: const Icon(Icons.folder_open, size: 20),
              ),
              IconButton(
                tooltip: 'Save to API',
                onPressed: controller.busy ? null : () async {
                  final ok = await controller.saveProject();
                  _toast(controller.status ?? (ok ? 'Saved' : 'Could not save'));
                },
                icon: const Icon(Icons.cloud_upload_outlined, size: 20),
              ),
            ],
          ),
          body: SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
              children: [
                _statusStrip(controller),

                SectionHead(
                  number: '01',
                  title: 'Load schedule',
                  sub: '${controller.loads.length} rows',
                ),
                for (var i = 0; i < controller.loads.length; i++)
                  LoadRow(
                    key: ValueKey('load-$i'),
                    load: controller.loads[i],
                    onChanged: (load) => controller.updateLoad(i, load),
                    onRemove: () => controller.removeLoad(i),
                  ),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: controller.addLoad,
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Add load'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: VoltColors.cyan,
                          side: const BorderSide(color: Color(0x5956D6D0)),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                    ),
                  ],
                ),

                if (controller.error != null) ...[
                  const SizedBox(height: 12),
                  _alert(controller.error!, isError: true),
                ],

                if (report != null) ...[
                  const SectionHead(number: '02', title: 'Demand overview', sub: 'live calculation'),
                  Row(
                    children: [
                      Expanded(
                        child: MetricCard(
                          label: 'Connected load',
                          value: fmtNum(report.summary.connectedKw),
                          unit: 'kW',
                          foot: 'installed equipment',
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: MetricCard(
                          label: 'Max demand',
                          value: fmtNum(report.summary.maxDemandKva),
                          unit: 'kVA',
                          foot: 'after diversity',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: MetricCard(
                          label: 'Power factor',
                          value: fmtNum(report.summary.overallPf, digits: 3),
                          foot: 'combined schedule',
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: MetricCard(
                          label: 'Feeder current',
                          value: fmtNum(report.feederCurrent),
                          unit: 'A',
                          foot: '${report.settings.phases}-phase estimate',
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 14),
                  Panel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Demand by equipment',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 10),
                        DemandBars(rows: report.breakdown),
                      ],
                    ),
                  ),

                  const SectionHead(number: '03', title: 'Equipment sizing'),
                  Panel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Main feeder cable',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 10),
                        if (report.cable != null) ...[
                          ResultHighlight(
                            eyebrow: 'Recommended cable',
                            headline: report.cable!.label,
                            sub: 'Copper · XLPE · armoured',
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: MetricCard(
                                  label: 'Derated capacity',
                                  value: '${fmtNum(report.cable!.deratedCapacityA, digits: 0)} A',
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: MetricCard(
                                  label: 'Voltage drop',
                                  value: fmtPct(report.cable!.voltageDropPct, digits: 2),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(
                            'Current ${fmtNum(report.feederCurrent)} A · limit '
                            '${fmtPct(report.settings.maxVdPct, digits: 1)} · governed by '
                            '${report.cable!.limitedBy}',
                            style: const TextStyle(fontSize: 11, color: VoltColors.muted),
                          ),
                        ] else
                          const Text('Add a valid load to size the cable.',
                              style: TextStyle(color: VoltColors.muted, fontSize: 12)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Panel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Transformer rating',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 10),
                        if (report.transformer != null) ...[
                          ResultHighlight(
                            eyebrow: 'Next standard rating',
                            headline: '${fmtNum(report.transformer!.kva, digits: 0)} kVA',
                            sub: 'Transformer capacity recommendation',
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: MetricCard(
                                  label: 'Requirement',
                                  value: '${fmtNum(report.transformer!.requiredKva)} kVA',
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: MetricCard(
                                  label: 'Loading',
                                  value: fmtPct(report.transformer!.loadingPct, digits: 1),
                                ),
                              ),
                            ],
                          ),
                        ] else
                          const Text('Add a valid load to size the transformer.',
                              style: TextStyle(color: VoltColors.muted, fontSize: 12)),
                      ],
                    ),
                  ),

                  if (report.warnings.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    for (final warning in report.warnings)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _alert(warning),
                      ),
                  ],
                ],

                const SectionHead(number: '04', title: 'Supply & cable settings'),
                _settingsPanel(controller),

                const SizedBox(height: 14),
                OutlinedButton.icon(
                  onPressed: _copySchedule,
                  icon: const Icon(Icons.copy_all, size: 18),
                  label: const Text('Copy schedule JSON'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: VoltColors.muted,
                    side: const BorderSide(color: VoltColors.line),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
                const SizedBox(height: 18),
                const Text(
                  'Indicative copper XLPE cable data only. Confirm installation method, ambient '
                  'temperature, grouping, short-circuit withstand and applicable IS / IEC '
                  'requirements with a qualified electrical engineer before construction.',
                  style: TextStyle(fontSize: 11, height: 1.6, color: Color(0xFF71869F)),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _statusStrip(EstimatorController controller) {
    final online = controller.apiOnline;
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 4),
      child: Row(
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: online ? VoltColors.lime : VoltColors.danger,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              controller.status ??
                  (online
                      ? 'Connected to ${controller.api.baseUrl}'
                      : 'Offline — calculations run on the device'),
              style: const TextStyle(fontSize: 11, color: VoltColors.muted),
            ),
          ),
          TextButton(
            onPressed: controller.busy ? null : controller.refreshProjects,
            child: const Text('Refresh', style: TextStyle(fontSize: 11)),
          ),
        ],
      ),
    );
  }

  Widget _settingsPanel(EstimatorController controller) {
    final settings = controller.settings;

    Widget slider(
      String label,
      double value,
      double min,
      double max,
      double step,
      String display,
      EstimatorSettings Function(double) apply,
    ) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFFB8C7D9))),
              Text(display, style: const TextStyle(fontSize: 12, color: VoltColors.cyan)),
            ],
          ),
          Slider(
            value: value.clamp(min, max).toDouble(),
            min: min,
            max: max,
            divisions: ((max - min) / step).round(),
            onChanged: (v) => controller.updateSettings(apply(v)),
          ),
        ],
      );
    }

    Widget number(
      String label,
      double value,
      EstimatorSettings Function(double) apply,
    ) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          initialValue: value == value.roundToDouble() ? value.toStringAsFixed(0) : value.toString(),
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: label),
          onFieldSubmitted: (text) {
            final parsed = double.tryParse(text);
            if (parsed != null) controller.updateSettings(apply(parsed));
          },
        ),
      );
    }

    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Eyebrow('Supply parameters'),
          const SizedBox(height: 10),
          number('Line voltage (V)', settings.voltage, (v) => settings.copyWith(voltage: v)),
          number('Diversity factor (≥ 1)', settings.diversityFactor,
              (v) => settings.copyWith(diversityFactor: v < 1 ? 1 : v)),
          number('Cable route length (m)', settings.cableLengthM,
              (v) => settings.copyWith(cableLengthM: v)),
          const Divider(color: VoltColors.line, height: 20),
          slider('Overall derating', settings.derating, 0.4, 1, 0.05,
              settings.derating.toStringAsFixed(2),
              (v) => settings.copyWith(derating: v)),
          slider('Maximum voltage drop', settings.maxVdPct, 1, 8, 0.5,
              '${settings.maxVdPct.toStringAsFixed(1)}%',
              (v) => settings.copyWith(maxVdPct: v)),
          slider('Max transformer loading', settings.maxLoading, 0.5, 1, 0.05,
              '${(settings.maxLoading * 100).round()}%',
              (v) => settings.copyWith(maxLoading: v)),
          slider('Future load allowance', settings.futureMargin, 0, 0.5, 0.05,
              '${(settings.futureMargin * 100).round()}%',
              (v) => settings.copyWith(futureMargin: v)),
        ],
      ),
    );
  }

  Widget _alert(String message, {bool isError = false}) {
    final color = isError ? VoltColors.danger : const Color(0xFFF4E2B0);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(message, style: TextStyle(fontSize: 11.5, height: 1.5, color: color)),
    );
  }
}
