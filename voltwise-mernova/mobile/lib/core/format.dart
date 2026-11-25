/// Number formatting helpers (Indian digit grouping, matching the web client).
String fmtNum(num? value, {int digits = 1}) {
  if (value == null) return '—';
  final fixed = value.toDouble().toStringAsFixed(digits);
  final parts = fixed.split('.');
  var whole = parts[0];
  final negative = whole.startsWith('-');
  if (negative) whole = whole.substring(1);

  String grouped;
  if (whole.length <= 3) {
    grouped = whole;
  } else {
    final last3 = whole.substring(whole.length - 3);
    var rest = whole.substring(0, whole.length - 3);
    final chunks = <String>[];
    while (rest.length > 2) {
      chunks.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    if (rest.isNotEmpty) chunks.insert(0, rest);
    grouped = '${chunks.join(',')},$last3';
  }
  final sign = negative ? '-' : '';
  return parts.length > 1 ? '$sign$grouped.${parts[1]}' : '$sign$grouped';
}

String fmtPct(num? value, {int digits = 0}) => '${fmtNum(value, digits: digits)}%';
