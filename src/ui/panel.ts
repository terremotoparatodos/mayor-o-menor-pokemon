// Panel de control del que graba (fuera del reel, no sale en cámara). Mismo estilo que PokeDuelo.
import { CATEGORY_LABEL, formatValue, pickedName } from '../game/format';
import { correctGuess } from '../game/rounds';
import type { Session, SessionConfig } from '../game/session';

export interface PanelActions {
  next(): void;
  reroll(): void;
  toggleCategory(): void;
  replay(): void;
  undo(): void;
  switchTurn(): void;
  newGame(config: SessionConfig): void;
  toggleCuadro(): void;
  toggleGuides(): void;
  toggleMute(): boolean;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]) => {
  const el: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props);
  el.append(...kids);
  return el;
};
const btn = (text: string, onclick: () => void, className = '') => h('button', { textContent: text, onclick, className });

export class Panel {
  private info = h('div');
  private playersBox = h('div');
  private session!: Session;

  constructor(private root: HTMLElement, private actions: PanelActions) {}

  bind(session: Session) {
    this.session = session;
    this.build();
    session.onChange(() => this.refresh());
    this.refresh();
  }

  private build() {
    const s = this.session;
    const cfg = s.config;
    const total = h('input', { type: 'number', min: '0', max: '99', value: String(cfg.totalRounds) });
    const count = h('select', {}, h('option', { value: '2', textContent: '2 jugadores (turnos)' }), h('option', { value: '1', textContent: '1 jugador (racha)' }));
    count.value = String(s.players.length);
    const mode = h('select', {},
      ...([['alternate', 'Alternar altura / peso'], ['height', 'Sólo altura'], ['weight', 'Sólo peso'], ['random', 'Al azar']] as const)
        .map(([value, textContent]) => h('option', { value, textContent })));
    mode.value = cfg.categoryMode;
    const minR = h('input', { type: 'number', step: '0.05', min: '1.01', value: String(cfg.rules.minRatio) });
    const maxR = h('input', { type: 'number', step: '0.5', min: '1.1', value: String(cfg.rules.maxRatio) });
    const restart = () => {
      const names = s.players.map((p) => p.name);
      const n = Number(count.value);
      this.actions.newGame({
        players: n === 1 ? [names[0]] : [names[0], names[1] ?? 'GUTI'],
        totalRounds: Math.max(0, Math.round(Number(total.value) || 0)),
        categoryMode: mode.value as SessionConfig['categoryMode'],
        rules: { ...cfg.rules, minRatio: Math.max(1.01, Number(minR.value) || 1.15), maxRatio: Math.max(1.1, Number(maxR.value) || 8) },
      });
    };
    const mute = btn('🔊 Sonido', () => { mute.textContent = this.actions.toggleMute() ? '🔇 Mute' : '🔊 Sonido'; });

    this.root.replaceChildren(
      h('header', {}, h('h2', { textContent: '¿MAYOR O MENOR? · Panel' }), h('span', { className: 'muted', textContent: 'P oculta' })),
      h('section', {}, h('h3', { textContent: 'Ronda' }), this.info,
        h('div', { className: 'line' },
          btn('▶ Continuar', () => this.actions.next(), 'primary'),
          btn('🎲 Otra pareja', () => this.actions.reroll()),
          btn('⇄ Altura/Peso', () => this.actions.toggleCategory())),
        h('div', { className: 'line mt' },
          btn('↺ Repetir animación', () => this.actions.replay()),
          btn('↶ Deshacer', () => this.actions.undo()),
          btn('⇆ Turno', () => this.actions.switchTurn()))),
      h('section', {}, h('h3', { textContent: 'Jugadores' }), this.playersBox),
      h('section', {}, h('h3', { textContent: 'Partida nueva' }),
        h('label', { textContent: 'Modo' }), count,
        h('label', { textContent: 'Categoría' }), mode,
        h('label', { textContent: 'Rondas (0 = sin final) · diferencia mínima ×  · máxima ×' }),
        h('div', { className: 'line' }, total, minR, maxR),
        h('div', { className: 'line mt' }, btn('Empezar partida nueva', restart, 'danger'))),
      h('section', {}, h('h3', { textContent: 'Grabación' }),
        h('div', { className: 'line' }, btn('⬛ Cuadro / reel', () => this.actions.toggleCuadro()), btn('Guías', () => this.actions.toggleGuides()), mute)),
      h('footer', {},
        h('kbd', { textContent: '←' }), ' / ', h('kbd', { textContent: '→' }), ' elegir · ',
        h('kbd', { textContent: 'Enter' }), ' continuar/saltar · ', h('kbd', { textContent: 'N' }), ' otra pareja · ',
        h('kbd', { textContent: 'C' }), ' categoría · ', h('kbd', { textContent: 'A' }), ' repetir · ',
        h('kbd', { textContent: 'U' }), ' deshacer · ', h('kbd', { textContent: 'J' }), ' turno · ',
        h('kbd', { textContent: '+/−' }), ' puntos · ', h('kbd', { textContent: 'R' }), ' 1:1 · ',
        h('kbd', { textContent: 'G' }), ' guías · ', h('kbd', { textContent: 'M' }), ' mute'),
    );
  }

  private refresh() {
    const s = this.session;
    const r = s.round;
    const ans = pickedName(r, correctGuess(r.a, r.b, r.category));
    this.info.replaceChildren(
      h('div', { textContent: `Ronda ${r.no} · ${CATEGORY_LABEL[r.category]} · fase: ${s.phase}` }),
      h('div', { className: 'muted', textContent: `◀ ${r.a.name} · ${r.b.name} ▶` }),
      // La respuesta queda plegada: el panel puede salir en cámara por accidente.
      h('details', {}, h('summary', { textContent: 'Ver respuesta' }),
        h('div', { className: 'muted', textContent: `A: ${r.a.name} (#${r.a.dex}) ${formatValue(r.a.height, 'height')} · ${formatValue(r.a.weight, 'weight')}` }),
        h('div', { className: 'muted', textContent: `B: ${r.b.name} (#${r.b.dex}) ${formatValue(r.b.height, 'height')} · ${formatValue(r.b.weight, 'weight')}` }),
        h('div', { className: 'answer', textContent: `Respuesta: ${ans}` })),
    );
    if (this.playersBox.contains(document.activeElement)) return;
    this.playersBox.replaceChildren(...s.players.map((p, i) => {
      const name = h('input', { value: p.name, maxLength: 12 });
      name.addEventListener('change', () => s.rename(i, name.value.toUpperCase()));
      return h('div', { className: 'line mb' },
        name, btn('−', () => s.adjustScore(i, -1)), h('span', { className: 'score', textContent: String(p.score) }), btn('+', () => s.adjustScore(i, 1)));
    }));
  }
}
