import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citedRefs, linkCitations, stripCitations } from './citations';

test('parses single and grouped citations', () => {
  const text = 'You live in Pune [M2] and love hiking [M1, P3]. Rent is due on the 5th [D1; M2].';
  assert.deepEqual(citedRefs(text), ['M2', 'M1', 'P3', 'D1']);
  assert.equal(stripCitations(text), 'You live in Pune and love hiking. Rent is due on the 5th.');
});

test('accepts the lenticular brackets some models emit', () => {
  assert.deepEqual(citedRefs('Birthday is May 3【M1】.'), ['M1']);
  assert.equal(linkCitations('May 3【M1】.', new Set(['M1'])), 'May 3 [M1](#cite:M1).');
});

test('links only refs that exist; drops unknown ones', () => {
  const out = linkCitations('Pune [M2, M9].', new Set(['M2']));
  assert.equal(out, 'Pune [M2](#cite:M2).');
  assert.equal(linkCitations('nothing [X1] here [M5]', new Set()), 'nothing [X1] here');
});
