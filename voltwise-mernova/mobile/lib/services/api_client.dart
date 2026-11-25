import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/engine.dart';

/// Result of a project fetched from the MERN API.
class SavedProject {
  SavedProject({required this.id, required this.name, required this.loads, required this.settings});

  factory SavedProject.fromJson(Map<String, dynamic> json) {
    final rawLoads = (json['loads'] as List<dynamic>? ?? const [])
        .map((e) => LoadSpec.fromJson(e as Map<String, dynamic>))
        .toList();
    return SavedProject(
      id: (json['id'] ?? json['_id']).toString(),
      name: (json['name'] ?? 'Untitled').toString(),
      loads: rawLoads,
      settings: EstimatorSettings.fromJson(
        (json['settings'] as Map<String, dynamic>?) ?? const {},
      ),
    );
  }

  final String id;
  final String name;
  final List<LoadSpec> loads;
  final EstimatorSettings settings;
}

class ApiException implements Exception {
  ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Talks to the Express API. Works offline too: every call is optional, the
/// app always calculates locally with the Dart engine.
class ApiClient {
  ApiClient({this.baseUrl = 'http://10.0.2.2:4000'});

  /// Android emulator reaches the host machine on 10.0.2.2.
  /// Use http://localhost:4000 on iOS simulator / desktop.
  String baseUrl;

  Uri _uri(String path) => Uri.parse('$baseUrl/api$path');

  Future<Map<String, dynamic>> _decode(http.Response res) async {
    final body = res.body.isEmpty ? <String, dynamic>{} : jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw ApiException((body['error'] ?? 'Request failed (${res.statusCode})').toString());
    }
    return body;
  }

  Future<bool> ping() async {
    try {
      final res = await http.get(_uri('/health')).timeout(const Duration(seconds: 4));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<List<SavedProject>> listProjects() async {
    final res = await http.get(_uri('/projects')).timeout(const Duration(seconds: 8));
    final body = await _decode(res);
    return (body['projects'] as List<dynamic>? ?? const [])
        .map((e) => SavedProject.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<SavedProject> saveProject({
    String? id,
    required String name,
    required List<LoadSpec> loads,
    required EstimatorSettings settings,
  }) async {
    final payload = jsonEncode({
      'name': name,
      'loads': loads.map((l) => l.toJson()).toList(),
      'settings': settings.toJson(),
    });
    final headers = {'content-type': 'application/json'};
    final res = id == null
        ? await http.post(_uri('/projects'), headers: headers, body: payload)
        : await http.put(_uri('/projects/$id'), headers: headers, body: payload);
    return SavedProject.fromJson(await _decode(res));
  }

  Future<void> deleteProject(String id) async {
    final res = await http.delete(_uri('/projects/$id'));
    if (res.statusCode >= 400) throw ApiException('Delete failed (${res.statusCode})');
  }

  /// Server-side estimate — handy for checking that the Dart engine agrees.
  Future<Map<String, dynamic>> estimate({
    required List<LoadSpec> loads,
    required EstimatorSettings settings,
  }) async {
    final res = await http.post(
      _uri('/estimate'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({
        'loads': loads.map((l) => l.toJson()).toList(),
        'settings': settings.toJson(),
      }),
    );
    return _decode(res);
  }
}
