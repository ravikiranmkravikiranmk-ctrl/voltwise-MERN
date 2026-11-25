import 'package:flutter/material.dart';

import 'screens/studio_screen.dart';
import 'state/estimator_controller.dart';
import 'theme.dart';

void main() => runApp(const VoltwiseApp());

class VoltwiseApp extends StatefulWidget {
  const VoltwiseApp({super.key});

  @override
  State<VoltwiseApp> createState() => _VoltwiseAppState();
}

class _VoltwiseAppState extends State<VoltwiseApp> {
  late final EstimatorController _controller = EstimatorController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Voltwise · Load Studio',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: StudioScreen(controller: _controller),
    );
  }
}
