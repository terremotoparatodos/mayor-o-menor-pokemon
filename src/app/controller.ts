// Orquesta inicio ↔ sesión ↔ cuadro ↔ escena 3D ↔ sonido, y encadena las transiciones entre fases.
// Cada transición lleva un número: si llega otra acción en el medio, la vieja se descarta.
import pokedex from '../content/pokedex.json';
import { Sfx } from '../audio/sfx';
import { seeded, seedFrom, type Rng } from '../game/random';
import { Session, type SessionConfig } from '../game/session';
import type { Category, Guess, Phase, Round, Species } from '../game/types';
import { Comparison, type Beat } from '../render/comparison';
import { LabelLayer } from '../render/labels';
import { Panel } from '../ui/panel';
import { SquareView } from '../ui/squareView';

const POOL = pokedex as Species[];
/** Duraciones de las transiciones (ms); deben coincidir con styles.css. */
const MS = { modeOut: 560, picked: 650, leave: 420 };

export class Controller {
  session: Session | null = null;
  config: SessionConfig;
  readonly sfx = new Sfx();
  private view: SquareView;
  private scene: Comparison;
  private panel: Panel;
  private rng: Rng;
  private seen: { phase: Phase; round: Round } | null = null;
  private loading: Promise<boolean> | null = null;
  private loadingFor: Round | null = null;
  private tx = 0;
  private changing = false;

  constructor(square: HTMLElement, panelRoot: HTMLElement, seed: string | null, config: SessionConfig) {
    this.config = config;
    this.rng = seeded(seedFrom(seed));
    this.view = new SquareView(square, { onGuess: (g) => this.guess(g), onMode: (c) => this.chooseMode(c), onNext: () => this.next() });
    this.scene = new Comparison(square.querySelector('.scene')!, new LabelLayer(square.querySelector('.tags')!), (b) => this.beat(b));
    this.panel = new Panel(panelRoot, this);
    this.view.renderMenu();
    this.panel.refresh();
  }

  private wait(ms: number) {
    const id = this.tx;
    return new Promise<boolean>((res) => setTimeout(() => res(id === this.tx), ms));
  }

  // ── Acciones (teclas, botones del cuadro y panel) ──

  chooseMode(c: Category) {
    this.sfx.unlock();
    if (this.session || this.changing) return;
    this.changing = true;
    const id = ++this.tx;
    this.sfx.pick();
    this.view.pickMode(c);
    const s = new Session(POOL, this.config, c, this.rng);
    void this.ensurePrepared(s.round);
    void this.wait(MS.modeOut).then((ok) => {
      this.changing = false;
      if (!ok || id !== this.tx) return;
      this.session = s;
      this.seen = null;
      s.onChange(() => this.sync());
      this.view.resetMenu();
      this.sync();
    });
  }

  guess(g: Guess) {
    this.sfx.unlock();
    if (!this.session) { this.chooseMode(g === 'a' ? 'height' : 'weight'); return; }
    if (this.session.phase !== 'guess' || this.changing) return;
    this.sfx.pick();
    this.session.guess(g);
  }

  /** Enter: salta la animación, continúa, o al final vuelve al inicio. */
  next() {
    this.sfx.unlock();
    const s = this.session;
    if (!s || this.changing) return;
    if (s.phase === 'reveal') { this.scene.skip(); return; }
    if (s.phase === 'over') { this.toMenu(); return; }
    s.next();
  }

  toMenu() {
    if (!this.session) return;
    const id = ++this.tx;
    this.changing = true;
    this.session = null;
    this.view.setStage('leaving');
    this.view.showStamp(null);
    void this.wait(MS.leave).then(() => {
      this.changing = false;
      if (id !== this.tx) return;
      this.scene.hide();
      this.view.renderMenu();
      this.panel.refresh();
    });
  }

  reroll() { if (!this.changing) this.session?.reroll(); }
  undo() { if (!this.changing) this.session?.undo(); }
  adjustScore(d: number) { this.session?.adjustScore(d); }

  replay() {
    const ph = this.session?.phase;
    if (ph !== 'result' && ph !== 'over') return;
    ++this.tx;
    this.view.showStamp(null);
    this.view.setStage('reveal');
    this.scene.replay();
  }

  frame(dt: number) {
    this.scene.frame(dt);
  }

  /** Carga los modelos de la ronda; si falta alguno pide otra pareja. */
  private ensurePrepared(round: Round): Promise<boolean> {
    if (this.scene.preparedFor === round) return Promise.resolve(true);
    if (this.loading && this.loadingFor === round) return this.loading;
    this.loadingFor = round;
    this.loading = this.scene.prepare(round).then(
      () => this.scene.preparedFor === round,
      (err) => {
        console.warn(`Modelo no disponible (${round.a.name} / ${round.b.name}):`, err);
        const s = this.session;
        if (s && s.round === round && s.phase === 'guess') s.reroll();
        return false;
      },
    );
    return this.loading;
  }

  // ── Reacción a cambios de la sesión ──

  private sync() {
    const s = this.session;
    if (!s) return;
    const prev = this.seen;
    this.seen = { phase: s.phase, round: s.round };
    this.panel.refresh();
    if (prev && prev.phase === s.phase && prev.round === s.round) { this.view.render(s); return; }
    const id = ++this.tx;

    switch (s.phase) {
      case 'guess': {
        this.view.setWaiting(false);
        void this.ensurePrepared(s.round);
        if (prev?.phase === 'result') {
          // Ronda nueva: la escena se va y recién después entran las cartas nuevas.
          this.view.setStage('leaving');
          this.view.showStamp(null);
          void this.wait(MS.leave).then((ok) => {
            if (!ok || id !== this.tx) return;
            this.scene.hide();
            this.enterGuess(s);
            this.sfx.nextRound();
          });
        } else {
          this.scene.hide();
          this.view.showStamp(null);
          if (prev && prev.round === s.round) { this.view.render(s); this.view.setStage('guess'); }
          else this.enterGuess(s);
        }
        break;
      }
      case 'reveal': {
        const round = s.round;
        this.view.render(s);
        this.view.setStage('picked', s.outcome!.guess);
        void Promise.all([this.wait(MS.picked), this.ensurePrepared(round)]).then(([ok, ready]) => {
          if (!ok || !ready || id !== this.tx || s.round !== round || s.phase !== 'reveal') return;
          this.view.setWaiting(false);
          const [a, b] = this.view.frameRects();
          this.scene.setOrigin(a, b);
          this.view.setStage('reveal');
          this.scene.play(() => s.finishReveal());
          this.sfx.drumroll(0.75, 1.45);
        });
        void this.wait(MS.picked + 150).then((ok) => {
          if (ok && id === this.tx && this.scene.preparedFor !== round) this.view.setWaiting(true);
        });
        break;
      }
      case 'result':
      case 'over': {
        this.view.render(s);
        const round = s.round;
        if (prev?.phase === 'reveal') {
          this.view.flash(s.outcome!.correct);
          if (s.outcome!.correct) this.sfx.correct(); else this.sfx.wrong();
        } else {
          // Viene de deshacer o del final: la escena se pinta directamente en su estado final.
          void this.ensurePrepared(round).then((ok) => {
            if (!ok || id !== this.tx || s.round !== round) return;
            if (this.scene.preparedFor === round && prev?.phase !== 'result') this.scene.showFinal();
            this.view.setStage('reveal');
          });
        }
        this.view.showStamp(s);
        if (s.phase === 'over') this.sfx.final();
        break;
      }
    }
  }

  private enterGuess(s: Session) {
    this.view.render(s);
    this.view.setStage('guess');
    this.view.deal();
  }

  /** Sonidos y sacudón en los momentos clave de la animación. */
  private beat(b: Beat) {
    if (b === 'land') { this.sfx.thud(); return; }
    // Salto a escala real: golpe fuerte y sacudón.
    this.sfx.thud();
    this.sfx.morph(0, 0.25);
    this.view.shake(true);
  }
}
