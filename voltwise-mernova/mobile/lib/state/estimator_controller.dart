import 'package:flutter/foundation.dart';

import '../core/engine.dart';
import '../services/api_client.dart';

/// Single source of truth for the Flutter screen: the schedule, the settings,
/// the live report and the (optional) link to the MERN API.
class EstimatorController extends ChangeNotifier {
  EstimatorController({
    List<LoadSpec>? loads,
    EstimatorSettings settings = const EstimatorSettings(
      diversityFactor: 1.1,
      derating: 0.8,
      cableLengthM: 120,
    ),
    ApiClient? api,
  })  : _loads = List<LoadSpec>.from(loads ?? sampleLoads),
        _settings = settings,
        api = api ?? ApiClient() {
    _recalculate();
  }

  final ApiClient api;

  List<LoadSpec> _loads;
  EstimatorSettings _settings;
  EstimateReport? _report;
  String? _error;

  String projectName = '';
  String? projectId;
  List<SavedProject> projects = const [];
  bool apiOnline = false;
  bool busy = false;
  String? status;

  List<LoadSpec> get loads => List.unmodifiable(_loads);
  EstimatorSettings get settings => _settings;
  EstimateReport? get report => _report;
  String? get error => _error;

  void _recalculate() {
    try {
      _report = estimate(loads: _loads, settings: _settings);
      _error = null;
    } catch (e) {
      _report = null;
      _error = e.toString();
    }
    notifyListeners();
  }

  // ------------------------------------------------------------- schedule --
  void updateLoad(int index, LoadSpec load) {
    _loads[index] = load;
    _recalculate();
  }

  void addLoad() {
    _loads.add(const LoadSpec(name: 'New load', quantity: 1, ratedKw: 5, powerFactor: 0.85));
    _recalculate();
  }

  void removeLoad(int index) {
    if (index < 0 || index >= _loads.length) return;
    _loads.removeAt(index);
    _recalculate();
  }

  void replaceLoads(List<LoadSpec> loads) {
    _loads = List<LoadSpec>.from(loads);
    projectId = null;
    _recalculate();
  }

  void updateSettings(EstimatorSettings settings) {
    _settings = settings;
    _recalculate();
  }

  // ------------------------------------------------------------- projects --
  Future<void> refreshProjects() async {
    busy = true;
    notifyListeners();
    try {
      projects = await api.listProjects();
      apiOnline = true;
    } catch (_) {
      apiOnline = false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<bool> saveProject() async {
    final name = projectName.trim().isEmpty ? 'Untitled project' : projectName.trim();
    busy = true;
    status = null;
    notifyListeners();
    try {
      final saved = await api.saveProject(
        id: projectId,
        name: name,
        loads: _loads,
        settings: _settings,
      );
      projectId = saved.id;
      projectName = saved.name;
      apiOnline = true;
      status = 'Saved “${saved.name}”';
      projects = await api.listProjects();
      return true;
    } catch (e) {
      apiOnline = false;
      status = 'Could not save: $e';
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  void openProject(SavedProject project) {
    _loads = List<LoadSpec>.from(project.loads);
    _settings = project.settings;
    projectId = project.id;
    projectName = project.name;
    status = 'Loaded “${project.name}”';
    _recalculate();
  }

  Future<void> deleteProject(SavedProject project) async {
    try {
      await api.deleteProject(project.id);
      if (project.id == projectId) {
        projectId = null;
        projectName = '';
      }
      projects = await api.listProjects();
      status = 'Deleted “${project.name}”';
    } catch (e) {
      status = 'Could not delete: $e';
    }
    notifyListeners();
  }
}
