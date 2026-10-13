// Exact arithmetic for the `lookup` tool — LLMs are unreliable at math. A small recursive-descent
// parser (never eval): + - * / ^, percent (15% of 80) or modulo (17 % 5), parentheses, unary minus,
// and a handful of functions/constants.

const FUNCS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, exp: Math.exp,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log, log2: Math.log2,
  min: Math.min, max: Math.max, pow: Math.pow,
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export function evaluate(input: string): number {
  const src = input
    .toLowerCase()
    .replace(/×/g, '*')
    .replace(/(\d)\s*x\s*(?=[\d(])/g, '$1*') // 3x4, but never the x in max()
    .replace(/÷/g, '/')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1'); // 1,000,000 → 1000000
  let i = 0;
  const peek = () => src[i];
  const skip = () => {
    while (src[i] === ' ') i++;
  };
  const fail = (msg: string): never => {
    throw new Error(`${msg} at position ${i + 1} in "${input}"`);
  };

  function expr(): number {
    let v = term();
    for (skip(); peek() === '+' || peek() === '-'; skip()) {
      const op = src[i++];
      const from = i;
      let r = term();
      if (/^\s*[\d.]+\s*%\s*$/.test(src.slice(from, i))) r *= v; // "1000 + 18%" = 1180, as on a calculator
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function term(): number {
    let v = unary();
    for (skip(); peek() === '*' || peek() === '/' || peek() === '%'; skip()) {
      const op = src[i++];
      const r = unary();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  }
  // ^ binds tighter than unary minus (-3^2 = -9) and is right-associative (2^3^2 = 2^9).
  function unary(): number {
    skip();
    if (peek() === '-') return i++, -unary();
    if (peek() === '+') return i++, unary();
    return power();
  }
  function power(): number {
    const base = percent();
    skip();
    if (peek() === '^') {
      i++;
      return base ** unary();
    }
    return base;
  }
  // "15%" is 0.15 and "15% of 80" is 12; "17 % 5" (an operand right after) stays modulo in term().
  function percent(): number {
    const v = primary();
    skip();
    const of = /^%\s*of\b/.exec(src.slice(i));
    if (of) {
      i += of[0].length;
      return (v / 100) * unary();
    }
    if (peek() === '%' && !/^%\s*[\d.(a-z]/.test(src.slice(i))) {
      i++;
      return v / 100;
    }
    return v;
  }
  function primary(): number {
    skip();
    if (peek() === '(') {
      i++;
      const v = expr();
      skip();
      if (peek() !== ')') fail('Expected ")"');
      i++;
      return v;
    }
    const num = /^\d*\.?\d+(e[+-]?\d+)?/.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      return Number(num[0]);
    }
    const name = /^[a-z][a-z0-9]*/.exec(src.slice(i));
    if (!name) fail('Unexpected character');
    i += name![0].length;
    const id = name![0];
    if (id in CONSTS) return CONSTS[id];
    if (!(id in FUNCS)) fail(`Unknown name "${id}"`);
    skip();
    if (peek() !== '(') fail(`Expected "(" after ${id}`);
    i++;
    const args = [expr()];
    for (skip(); peek() === ','; skip()) {
      i++;
      args.push(expr());
    }
    if (peek() !== ')') fail('Expected ")"');
    i++;
    return FUNCS[id](...args);
  }

  const value = expr();
  skip();
  if (i < src.length) fail('Unexpected input');
  if (!Number.isFinite(value)) throw new Error(`"${input}" is not a finite number`);
  return value;
}

/** 12 significant digits, no float noise (0.1+0.2 → 0.3). */
export function formatNumber(n: number): string {
  return Number.isInteger(n) ? n.toString() : Number(n.toPrecision(12)).toString();
}
