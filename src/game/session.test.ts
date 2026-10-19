import { describe, expect, it } from 'vitest';
import pokedex from '../content/pokedex.json';
import { correctGuess, pickChallenger, ratio, valueOf } from './rounds';
import { seeded } from './random';
import { Session, type SessionConfig } from './session';
import type { Species } from './types';
import { formatValue } from './format';

const pool = pokedex as Species[];
const config: SessionConfig = {
  players: ['SKY', 'GUTI'],
  totalRounds: 5,
  categoryMode: 'alternate',
  rules: { minRatio: 1.15, maxRatio: 6, recentWindow: 30 },
};

describe('datos', () => {
  it('todas las especies tienen altura y peso positivos y nombre', () => {
    expect(pool.length).toBeGreaterThan(500);
    for (const s of pool) {
      expect(s.height).toBeGreaterThan(0);
      expect(s.weight).toBeGreaterThan(0);
      expect(s.name.length).toBeGreaterThan(0);
    }
  });
});

describe('rondas', () => {
  it('nunca hay empate y se respeta el rango de cociente', () => {
    const rng = seeded(1);
    for (let i = 0; i < 500; i++) {
      const a = pool[Math.floor(rng() * pool.length)];
      for (const c of ['height', 'weight'] as const) {
        const b = pickChallenger(pool, a, c, config.rules, [], rng);
        expect(b.dex).not.toBe(a.dex);
        expect(valueOf(b, c)).not.toBe(valueOf(a, c));
        const r = ratio(valueOf(a, c), valueOf(b, c));
        // Sólo los extremos (sin rivales en rango) relajan el tope máximo.
        expect(r).toBeGreaterThanOrEqual(config.rules.minRatio);
      }
    }
  });

  it('la respuesta correcta sale de los datos', () => {
    const pikachu = pool.find((s) => s.slug === 'pikachu')!;
    const snorlax = pool.find((s) => s.slug === 'snorlax')!;
    expect(correctGuess(pikachu, snorlax, 'height')).toBe('b');
    expect(correctGuess(snorlax, pikachu, 'weight')).toBe('a');
  });

  it('formatea como la Pokédex', () => {
    expect(formatValue(0.4, 'height')).toBe('0,4 m');
    expect(formatValue(460, 'weight')).toBe('460,0 kg');
  });
});

describe('sesión', () => {
  it('suma al jugador del turno sólo al terminar la animación y alterna turnos', () => {
    const s = new Session(pool, config, seeded(7));
    const first = s.round;
    s.guess(correctGuess(first.a, first.b, first.category));
    expect(s.phase).toBe('reveal');
    expect(s.players[0].score).toBe(0);
    s.finishReveal();
    expect(s.players[0].score).toBe(1);
    s.next();
    expect(s.round.player).toBe(1);
    // Pareja nueva: ninguno de los dos ya fue medido en la ronda anterior.
    expect([first.a.dex, first.b.dex]).not.toContain(s.round.a.dex);
    expect([first.a.dex, first.b.dex]).not.toContain(s.round.b.dex);
    expect(s.round.category).not.toBe(first.category); // alternado
  });

  it('una respuesta incorrecta no suma y deshacer restaura todo', () => {
    const s = new Session(pool, config, seeded(9));
    const r = s.round;
    const wrong = correctGuess(r.a, r.b, r.category) === 'a' ? 'b' : 'a';
    s.guess(wrong);
    s.finishReveal();
    expect(s.players[0].score).toBe(0);
    expect(s.results).toEqual([false]);
    s.undo();
    expect(s.phase).toBe('guess');
    expect(s.results).toEqual([]);
    expect(s.round).toBe(r);
  });

  it('no se puede responder dos veces ni avanzar antes del resultado', () => {
    const s = new Session(pool, config, seeded(3));
    s.guess('a');
    s.guess('b');
    expect(s.outcome!.guess).toBe('a');
    s.next();
    expect(s.round.no).toBe(1);
  });

  it('termina tras totalRounds', () => {
    const s = new Session(pool, config, seeded(5));
    for (let i = 0; i < config.totalRounds; i++) { s.guess('a'); s.finishReveal(); s.next(); }
    expect(s.phase).toBe('over');
  });
});
