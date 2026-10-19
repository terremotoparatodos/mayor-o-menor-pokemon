// Partida única: una categoría elegida al iniciar (altura o peso), un solo puntaje y N rondas.
// Cada ronda es una pareja nueva: ninguno de los dos valores se conoce de antes.
import { correctGuess, pickChallenger, type PairRules } from './rounds';
import type { Rng } from './random';
import type { Category, Guess, Phase, Round, Species } from './types';

export interface SessionConfig {
  /** 0 = sin final. */
  totalRounds: number;
  rules: PairRules;
}

export interface Outcome {
  guess: Guess;
  answer: Guess;
  correct: boolean;
}

interface Snapshot {
  round: Round;
  phase: Phase;
  score: number;
  outcome: Outcome | null;
  results: boolean[];
}

export class Session {
  score = 0;
  round: Round;
  phase: Phase = 'guess';
  outcome: Outcome | null = null;
  /** Resultado de cada ronda jugada (para la barra de progreso). */
  results: boolean[] = [];
  private recent: number[] = [];
  private history: Snapshot[] = [];
  private listeners = new Set<() => void>();

  constructor(
    private pool: readonly Species[],
    readonly config: SessionConfig,
    readonly category: Category,
    private rng: Rng,
  ) {
    this.round = this.makeRound(1);
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() { for (const fn of this.listeners) fn(); }

  private pickFirst(): Species {
    const recent = new Set(this.recent.slice(-this.config.rules.recentWindow));
    const fresh = this.pool.filter((s) => !recent.has(s.dex));
    const from = fresh.length ? fresh : this.pool;
    return from[Math.floor(this.rng() * from.length)];
  }

  private makeRound(no: number): Round {
    const a = this.pickFirst();
    const b = pickChallenger(this.pool, a, this.category, this.config.rules, this.recent, this.rng);
    this.recent.push(a.dex, b.dex);
    return { no, category: this.category, a, b };
  }

  get isLastRound() {
    return this.config.totalRounds > 0 && this.round.no >= this.config.totalRounds;
  }

  guess(g: Guess) {
    if (this.phase !== 'guess') return;
    this.snapshot();
    const answer = correctGuess(this.round.a, this.round.b, this.category);
    this.outcome = { guess: g, answer, correct: g === answer };
    this.phase = 'reveal';
    this.emit();
  }

  /** Lo llama la animación al terminar: recién ahí se ve y se suma el resultado. */
  finishReveal() {
    if (this.phase !== 'reveal' || !this.outcome) return;
    if (this.outcome.correct) this.score += 1;
    this.results.push(this.outcome.correct);
    this.phase = 'result';
    this.emit();
  }

  next() {
    if (this.phase !== 'result') return;
    this.snapshot();
    if (this.isLastRound) { this.phase = 'over'; this.emit(); return; }
    this.round = this.makeRound(this.round.no + 1);
    this.phase = 'guess';
    this.outcome = null;
    this.emit();
  }

  /** Cambia la pareja de la ronda en curso (antes de responder). */
  reroll() {
    if (this.phase !== 'guess') return;
    this.round = this.makeRound(this.round.no);
    this.emit();
  }

  adjustScore(delta: number) {
    this.score = Math.max(0, this.score + delta);
    this.emit();
  }

  /** Deshace la última acción (respuesta o paso de ronda). */
  undo() {
    const s = this.history.pop();
    if (!s) return;
    this.round = s.round;
    this.phase = s.phase;
    this.outcome = s.outcome;
    this.results = s.results;
    this.score = s.score;
    this.emit();
  }

  private snapshot() {
    this.history.push({ round: this.round, phase: this.phase, score: this.score, outcome: this.outcome, results: [...this.results] });
    if (this.history.length > 50) this.history.shift();
  }
}
