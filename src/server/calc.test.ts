import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, formatNumber } from './calc';

test('arithmetic precedence, power, unary, functions', () => {
  assert.equal(evaluate('2 + 3 * 4'), 14);
  assert.equal(evaluate('(2 + 3) * 4'), 20);
  assert.equal(evaluate('2 ^ 3 ^ 2'), 512); // right-associative
  assert.equal(evaluate('-3^2'), -9);
  assert.equal(evaluate('2^-1'), 0.5);
  assert.equal(evaluate('10 % 4'), 2);
  assert.equal(evaluate('sqrt(16) + max(1, 7, 3)'), 11);
  assert.equal(evaluate('round(2.345, 2)'), 2.35);
  assert.equal(evaluate('1,250,000 / 1,000'), 1250);
  assert.equal(evaluate('12 × 3 ÷ 4'), 9);
  assert.equal(evaluate('3x4 + max(2, exp(0))'), 14);
  assert.equal(formatNumber(evaluate('0.1 + 0.2')), '0.3');
  assert.ok(Math.abs(evaluate('2*pi') - 6.283185307) < 1e-6);
});

test('percent the way people write it', () => {
  assert.equal(formatNumber(evaluate('23.5% of 1847.25')), '434.10375');
  assert.equal(evaluate('15% of 80'), 12);
  assert.equal(evaluate('80 * 15%'), 12);
  assert.equal(evaluate('50% of 20% of 400'), 40);
  assert.equal(evaluate('1000 + 18%'), 1180); // calculator-style: plus 18% of 1000
  assert.equal(evaluate('1000 - 10%'), 900);
  assert.equal(evaluate('1000 + 10% of 50'), 1005);
  assert.equal(evaluate('17 % 5'), 2); // an operand right after % keeps it modulo
});

test('rejects anything that is not math', () => {
  assert.throws(() => evaluate('process.exit()'));
  assert.throws(() => evaluate('2 +'));
  assert.throws(() => evaluate('foo(1)'));
  assert.throws(() => evaluate('1/0'));
});
