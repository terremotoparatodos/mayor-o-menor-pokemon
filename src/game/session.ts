// Partida: jugadores, turnos, puntos y rondas. Cada ronda es una pareja nueva: ninguno de los dos valores
// se conoce de antes (por eso no hay cadena: el de una ronda anterior ya estaría medido).
import { correctGuess, nextCategory, pickChallenger, type PairRules } from './rounds';
import type { Rng } from './random';
import type { Category, Guess, Phase, Round, Species } from './types';

export interface SessionConfig {
  players: string[];
  /** 0 = sin final. */
  totalRounds: number;
  categoryMode: 'alternate' | 'random' | Category;
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
  scores: number[];
  outcome: Outcome | null;
  results: boolean[];
}

export class Session {
  players: { name: string; score: number }[];
  round!: Round;
  phase: Phase = 'guess';
  outcome: Outcome | null = null;
  /** Resultado de cada ronda jugada (para la barra de progreso). */
  results: boolean[] = [];
  private recent: number[] = [];
  private history: Snapshot[] = [];
  private listeners = new Set<() => void>();

  constructor(private pool: readonly Species[], readonly config: SessionConfig, private rng: Rng) {
    this.players = config.players.map((name) => ({ name, score: 0 }));
    this.newGame();
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() { for (const fn of this.listeners) fn(); }

  newGame() {
    for (const p of this.players) p.score = 0;
    this.results = [];
    this.history = [];
    this.recent = [];
    const category = nextCategory(this.config.categoryMode, null, this.rng);
    this.round = this.makeRound(1, category, this.pickFirst(), 0);
    this.phase = 'guess';
    this.outcome = null;
    this.emit();
  }

  private pickFirst(): Species {
    const recent = new Set(this.recent.slice(-this.config.rules.recentWindow));
    const fresh = this.pool.filter((s) => !recent.has(s.dex));
    const from = fresh.length ? fresh : this.pool;
    return from[Math.floor(this.rng() * from.length)];
  }

  private makeRound(no: number, category: Category, a: Species, player: number): Round {
    const b = pickChallenger(this.pool, a, category, this.config.rules, this.recent, this.rng);
    this.recent.push(a.dex, b.dex);
    return { no, category, a, b, player };
  }

  get isLastRound() {
    return this.config.totalRounds > 0 && this.round.no >= this.config.totalRounds;
  }

  guess(g: Guess) {
    if (this.phase !== 'guess') return;
    this.snapshot();
    const answer = correctGuess(this.round.a, this.round.b, this.round.category);
    this.outcome = { guess: g, answer, correct: g === answer };
    this.phase = 'reveal';
    this.emit();
  }

  /** Lo llama la animación al terminar: recién ahí se ve y se suma el resultado. */
  finishReveal() {
    if (this.phase !== 'reveal' || !this.outcome) return;
    if (this.outcome.correct) this.players[this.round.player].score += 1;
    this.results.push(this.outcome.correct);
    this.phase = 'result';
    this.emit();
  }

  next() {
    if (this.phase === 'over') { this.newGame(); return; }
    if (this.phase !== 'result') return;
    if (this.isLastRound) { this.phase = 'over'; this.emit(); return; }
    this.snapshot();
    const r = this.round;
    const category = nextCategory(this.config.categoryMode, r.category, this.rng);
    this.round = this.makeRound(r.no + 1, category, this.pickFirst(), (r.player + 1) % this.players.length);
    this.phase = 'guess';
    this.outcome = null;
    this.emit();
  }

  /** Cambia la pareja de la ronda en curso (antes de responder). */
  reroll() {
    if (this.phase !== 'guess') return;
    this.round = this.makeRound(this.round.no, this.round.category, this.pickFirst(), this.round.player);
    this.emit();
  }

  setCategory(c: Category) {
    if (this.phase !== 'guess' || this.round.category === c) return;
    this.round = this.makeRound(this.round.no, c, this.round.a, this.round.player);
    this.emit();
  }

  switchTurn() {
    if (this.phase !== 'guess') return;
    this.round = { ...this.round, player: (this.round.player + 1) % this.players.length };
    this.emit();
  }

  adjustScore(player: number, delta: number) {
    const p = this.players[player];
    if (!p) return;
    p.score = Math.max(0, p.score + delta);
    this.emit();
  }

  rename(player: number, name: string) {
    const p = this.players[player];
    if (!p) return;
    p.name = name.trim().slice(0, 12) || p.name;
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
    s.scores.forEach((v, i) => { this.players[i].score = v; });
    this.emit();
  }

  private snapshot() {
    this.history.push({
      round: this.round,
      phase: this.phase,
      scores: this.players.map((p) => p.score),
      outcome: this.outcome,
      results: [...this.results],
    });
    if (this.history.length > 50) this.history.shift();
  }
}
