import 'package:flutter_test/flutter_test.dart';
import 'package:voltwise_mobile/core/format.dart';

void main() {
  test('groups digits in the Indian style', () {
    expect(fmtNum(134.0, digits: 1), '134.0');
    expect(fmtNum(1234567, digits: 0), '12,34,567');
    expect(fmtNum(160, digits: 0), '160');
    expect(fmtNum(-1234.5, digits: 1), '-1,234.5');
  });

  test('formats percentages', () {
    expect(fmtPct(2.18, digits: 2), '2.18%');
  });
}
