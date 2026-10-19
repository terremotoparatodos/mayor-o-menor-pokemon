// Evaluador mínimo de Molang para las animaciones de Cobblemon.
// Cubre lo que usan sus .animation.json: aritmética, comparaciones, ternarios,
// math.* (en grados, como Bedrock) y query.anim_time. Variables desconocidas valen 0.

export interface MolangContext {
  animTime: number;
}

type Fn = (ctx: MolangContext) => number;

const DEG = Math.PI / 180;
const MATH: Record<string, (...a: number[]) => number> = {
  sin: (x) => Math.sin(x * DEG),
  cos: (x) => Math.cos(x * DEG),
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  trunc: Math.trunc,
  sqrt: Math.sqrt,
  exp: Math.exp,
  ln: Math.log,
  pow: Math.pow,
  min: Math.min,
  max: Math.max,
  mod: (a, b) => a % b,
  clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
  lerp: (a, b, t) => a + (b - a) * t,
  lerprotate: (a, b, t) => a + (b - a) * t,
  atan: (x) => Math.atan(x) / DEG,
  atan2: (y, x) => Math.atan2(y, x) / DEG,
  asin: (x) => Math.asin(x) / DEG,
  acos: (x) => Math.acos(x) / DEG,
  sign: Math.sign,
  hermite_blend: (t) => 3 * t * t - 2 * t * t * t,
  random: (a = 0, b = 1) => a + (b - a) * 0.5,
  random_integer: (a = 0) => a,
  die_roll: () => 0,
  die_roll_integer: () => 0,
};

const TIME_QUERIES = new Set(['anim_time', 'life_time', 'time_stamp']);

class Parser {
  private i = 0;
  private toks: string[];
  constructor(src: string) {
    this.toks = src.match(/\d*\.?\d+(?:e[+-]?\d+)?|[A-Za-z_][\w.]*|&&|\|\||==|!=|<=|>=|\?\?|[-+*/(),?:<>!]/gi) ?? [];
  }
  private peek() {
    return this.toks[this.i];
  }
  private next() {
    return this.toks[this.i++];
  }
  parse(): Fn {
    const e = this.ternary();
    return e;
  }
  private ternary(): Fn {
    const c = this.or();
    if (this.peek() === '?') {
      this.next();
      const a = this.ternary();
      if (this.peek() === ':') {
        this.next();
        const b = this.ternary();
        return (x) => (c(x) ? a(x) : b(x));
      }
      return (x) => (c(x) ? a(x) : 0);
    }
    return c;
  }
  private or(): Fn {
    let l = this.and();
    while (this.peek() === '||') {
      this.next();
      const a = l, b = this.and();
      l = (x) => (a(x) || b(x) ? 1 : 0);
    }
    return l;
  }
  private and(): Fn {
    let l = this.cmp();
    while (this.peek() === '&&') {
      this.next();
      const a = l, b = this.cmp();
      l = (x) => (a(x) && b(x) ? 1 : 0);
    }
    return l;
  }
  private cmp(): Fn {
    let l = this.add();
    for (;;) {
      const op = this.peek();
      if (!op || !['<', '>', '<=', '>=', '==', '!='].includes(op)) return l;
      this.next();
      const a = l, b = this.add();
      l = (x) => {
        const p = a(x), q = b(x);
        const r = op === '<' ? p < q : op === '>' ? p > q : op === '<=' ? p <= q : op === '>=' ? p >= q : op === '==' ? p === q : p !== q;
        return r ? 1 : 0;
      };
    }
  }
  private add(): Fn {
    let l = this.mul();
    for (;;) {
      const op = this.peek();
      if (op !== '+' && op !== '-') return l;
      this.next();
      const a = l, b = this.mul();
      l = op === '+' ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
    }
  }
  private mul(): Fn {
    let l = this.unary();
    for (;;) {
      const op = this.peek();
      if (op !== '*' && op !== '/') return l;
      this.next();
      const a = l, b = this.unary();
      l = op === '*' ? (x) => a(x) * b(x) : (x) => { const d = b(x); return d === 0 ? 0 : a(x) / d; };
    }
  }
  private unary(): Fn {
    const t = this.peek();
    if (t === '-') { this.next(); const a = this.unary(); return (x) => -a(x); }
    if (t === '+') { this.next(); return this.unary(); }
    if (t === '!') { this.next(); const a = this.unary(); return (x) => (a(x) ? 0 : 1); }
    return this.primary();
  }
  private primary(): Fn {
    const t = this.next();
    if (t === undefined) return () => 0;
    if (t === '(') {
      const e = this.ternary();
      if (this.peek() === ')') this.next();
      return e;
    }
    if (/^\d|^\./.test(t)) { const v = parseFloat(t); return () => v; }
    const name = t.toLowerCase();
    if (this.peek() === '(') {
      this.next();
      const args: Fn[] = [];
      while (this.peek() !== undefined && this.peek() !== ')') {
        args.push(this.ternary());
        if (this.peek() === ',') this.next();
      }
      this.next();
      const fname = name.replace(/^math\./, '');
      const f = MATH[fname];
      if (!f) return () => 0;
      return (x) => f(...args.map((a) => a(x)));
    }
    if (name === 'math.pi') return () => Math.PI;
    const q = name.match(/^(?:q|query)\.(\w+)$/);
    if (q && TIME_QUERIES.has(q[1])) return (x) => x.animTime;
    return () => 0;
  }
}

const cache = new Map<string, Fn>();

/** Compila una expresión Molang a una función. Expresiones con sentencias (`;`) devuelven 0. */
export function compileMolang(src: string | number): Fn {
  if (typeof src === 'number') return () => src;
  const key = src.trim();
  let fn = cache.get(key);
  if (!fn) {
    if (key === '') fn = () => 0;
    else if (key.includes(';') || key.includes('=') && !/[<>!=]=/.test(key)) fn = () => 0;
    else {
      try {
        fn = new Parser(key).parse();
      } catch {
        // Expresión fuera del subconjunto soportado: el hueso queda en reposo para esa clave.
        fn = () => 0;
      }
    }
    cache.set(key, fn);
  }
  return fn;
}
