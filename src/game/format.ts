import type { Category, Guess } from './types';

const nf = (digits: number) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const one = nf(1);

/** 0,4 m · 14,5 m · 6,9 kg · 999,9 kg (la Pokédex usa siempre un decimal). */
export function formatValue(v: number, c: Category) {
  return `${one.format(v)} ${c === 'height' ? 'm' : 'kg'}`;
}

export const UNIT: Record<Category, string> = { height: 'm', weight: 'kg' };
export const CATEGORY_LABEL: Record<Category, string> = { height: 'ALTURA', weight: 'PESO' };
export const QUESTION: Record<Category, string> = {
  height: '¿QUIÉN ES MÁS ALTO?',
  weight: '¿QUIÉN ES MÁS PESADO?',
};

export const pickedName = (r: { a: { name: string }; b: { name: string } }, g: Guess) => (g === 'a' ? r.a.name : r.b.name);
