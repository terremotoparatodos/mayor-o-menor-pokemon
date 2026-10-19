// Elección de parejas y corrección de respuestas. Sin DOM: se testea en Node.
import type { Category, Guess, Species } from './types';
import type { Rng } from './random';

export interface PairRules {
  /** Cociente mínimo entre los dos valores (1.15 = al menos 15 % de diferencia). Nunca hay empate. */
  minRatio: number;
  /** Cociente máximo: evita comparaciones obvias (una ballena contra un insecto). */
  maxRatio: number;
  /** Cuántas especies recientes no pueden volver a salir. */
  recentWindow: number;
}

export const valueOf = (s: Species, c: Category) => (c === 'height' ? s.height : s.weight);

export function ratio(a: number, b: number) {
  return Math.max(a, b) / Math.min(a, b);
}

/** Respuesta correcta: ¿quién es más alto / más pesado? Nunca empatan (ver pickChallenger). */
export function correctGuess(a: Species, b: Species, c: Category): Guess {
  return valueOf(b, c) > valueOf(a, c) ? 'b' : 'a';
}

/** Elige el rival de `a`. Si las reglas son demasiado estrictas, las relaja antes de rendirse. */
export function pickChallenger(
  pool: readonly Species[],
  a: Species,
  c: Category,
  rules: PairRules,
  recent: readonly number[],
  rng: Rng,
): Species {
  const va = valueOf(a, c);
  const blocked = new Set([a.dex, ...recent.slice(-rules.recentWindow)]);
  for (const [minR, maxR, useRecent] of [
    [rules.minRatio, rules.maxRatio, true],
    [rules.minRatio, Infinity, true],
    [1, Infinity, false],
  ] as const) {
    const options = pool.filter((s) => {
      if (s.dex === a.dex || (useRecent && blocked.has(s.dex))) return false;
      const vb = valueOf(s, c);
      if (vb === va || vb <= 0 || va <= 0) return false;
      const r = ratio(va, vb);
      return r >= minR && r <= maxR;
    });
    if (options.length) return options[Math.floor(rng() * options.length)];
  }
  throw new Error('No hay rival posible para esta pareja');
}

export function nextCategory(mode: 'alternate' | 'random' | Category, prev: Category | null, rng: Rng): Category {
  if (mode === 'height' || mode === 'weight') return mode;
  if (mode === 'random') return rng() < 0.5 ? 'height' : 'weight';
  return prev === 'height' ? 'weight' : 'height';
}
