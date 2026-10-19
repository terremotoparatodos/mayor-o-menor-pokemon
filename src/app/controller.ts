// Orquesta sesión ↔ cuadro ↔ escena 3D ↔ sonido. Reacciona a cambios de fase (incluido deshacer).
import pokedex from '../content/pokedex.json';
import { Sfx } from '../audio/sfx';
import { seeded, seedFrom } from '../game/random';
import { Session, type SessionConfig } from '../game/session';
import type { Guess, Phase, Round, Species } from '../game/types';
import { CompareScene, TIMELINE } from '../render/compareScene';
import { LabelLayer } from '../render/labels';
import { Panel } from '../ui/panel';
import { SquareView } from '../ui/squareView';

const POOL = pokedex as Species[];

export class Controller {
  session!: Session;
  readonly sfx = new Sfx();
  private view: SquareView;
  private scene: CompareScene;
  private panel: Panel;
  private seen: { phase: Phase; round: Round } | null = null;
  private loading: Promise<boolean> | null = null;
  private loadingFor: Round | null = null;

  constructor(square: HTMLElement, panelRoot: HTMLElement, private seed: string | null) {
    this.view = new SquareView(square, (g) => this.guess(g));
    const canvas = square.querySelector<HTMLCanvasElement>('canvas.scene')!;
    this.scene = new CompareScene(canvas, new LabelLayer(square.querySelector('.tags')!), canvas.width, canvas.height);
    this.panel = new Panel(panelRoot, {
      next: () => this.next(),
      reroll: () => this.session.reroll(),
      toggleCategory: () => this.toggleCategory(),
      replay: () => this.replay(),
      undo: () => this.session.undo(),
      switchTurn: () => this.session.switchTurn(),
      newGame: (c) => this.start(c),
      toggleCuadro: () => document.body.classList.toggle('cuadro'),
      toggleGuides: () => document.body.classList.toggle('clean'),
      toggleMute: () => this.sfx.toggleMute(),
    });
  }

  start(config: SessionConfig) {
    this.session = new Session(POOL, config, seeded(seedFrom(this.seed)));
    this.seen = null;
    this.session.onChange(() => this.sync());
    this.panel.bind(this.session);
    this.sync();
  }

  guess(g: Guess) {
    this.sfx.unlock();
    if (this.session.phase !== 'guess') return;
    this.sfx.pick();
    this.session.guess(g);
  }

  /** Enter: salta la animación, o continúa. */
  next() {
    this.sfx.unlock();
    if (this.session.phase === 'reveal') { this.scene.skip(); return; }
    this.session.next();
  }

  toggleCategory() {
    const r = this.session.round;
    this.session.setCategory(r.category === 'height' ? 'weight' : 'height');
  }

  replay() {
    const ph = this.session.phase;
    if (ph !== 'result' && ph !== 'over') return;
    this.view.showStamp(null);
    this.scene.replay();
    this.playRevealSounds();
  }

  frame(dt: number) {
    this.scene.frame(dt);
  }

  /** Carga los modelos de la ronda; si falta alguno pide otro rival (hasta 5 intentos). */
  private ensurePrepared(round: Round): Promise<boolean> {
    if (this.scene.preparedFor === round) return Promise.resolve(true);
    if (this.loading && this.loadingFor === round) return this.loading;
    this.loadingFor = round;
    this.loading = this.scene.prepare(round).then(
      () => this.scene.preparedFor === round,
      (err) => {
        console.warn(`Modelo no disponible (${round.a.name} / ${round.b.name}):`, err);
        if (this.session.round === round && this.session.phase === 'guess') this.session.reroll();
        return false;
      },
    );
    return this.loading;
  }

  private sync() {
    const s = this.session;
    const prev = this.seen;
    this.seen = { phase: s.phase, round: s.round };
    this.view.render(s);
    if (prev && prev.phase === s.phase && prev.round === s.round) return;

    switch (s.phase) {
      case 'guess':
        this.scene.hide();
        this.view.setReveal(false);
        this.view.setWaiting(false);
        this.view.showStamp(null);
        if (prev?.phase === 'result') this.sfx.nextRound();
        void this.ensurePrepared(s.round);
        break;
      case 'reveal': {
        const round = s.round;
        this.view.setWaiting(this.scene.preparedFor !== round);
        void this.ensurePrepared(round).then((ok) => {
          if (!ok || s !== this.session || s.round !== round || s.phase !== 'reveal') return;
          this.view.setWaiting(false);
          this.view.setReveal(true);
          this.scene.play(() => s.finishReveal());
          this.playRevealSounds();
        });
        break;
      }
      case 'result':
      case 'over': {
        const round = s.round;
        void this.ensurePrepared(round).then((ok) => {
          if (!ok || s !== this.session || s.round !== round) return;
          // Si venimos de deshacer, la escena se pinta directamente en su estado final.
          if (prev?.phase !== 'reveal' && prev?.phase !== 'result') this.scene.showFinal();
          this.view.setReveal(true);
        });
        this.view.showStamp(s);
        if (prev?.phase === 'reveal') {
          if (s.outcome?.correct) this.sfx.correct(); else this.sfx.wrong();
        }
        if (s.phase === 'over') this.sfx.final();
        break;
      }
    }
  }

  private playRevealSounds() {
    const T = TIMELINE;
    this.sfx.drumroll(0.3, T.morphStart - 0.3);
    this.sfx.morph(T.morphStart, T.morphDur);
    if (this.session.round.category === 'height') {
      const r = this.session.round;
      // El más bajo se frena cuando la medición (easeInOut) llega a su altura.
      const frac = Math.min(r.a.height, r.b.height) / Math.max(r.a.height, r.b.height);
      const x = frac < 0.5 ? Math.cbrt(frac / 4) : 1 - Math.cbrt((1 - frac) / 4);
      this.sfx.drumroll(T.height.sweep, T.height.sweepDur);
      this.sfx.thud(T.height.sweep + T.height.sweepDur * x);
      this.sfx.thud(T.height.sweep + T.height.sweepDur);
    } else {
      this.sfx.drumroll(T.weight.tilt - 0.2, 0.4);
      this.sfx.thud(T.weight.tilt + 0.25);
    }
  }
}
