// Panel de control del que graba (fuera del reel, no sale en cámara). Mismo estilo que PokeDuelo.
import type { Controller } from '../app/controller';
import { CATEGORY_LABEL, formatValue, pickedName } from '../game/format';
import { correctGuess } from '../game/rounds';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]) => {
  const el: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props);
  el.append(...kids);
  return el;
};
const btn = (text: string, onclick: () => void, className = '') => h('button', { textContent: text, onclick, className });
const kbd = (k: string) => h('kbd', { textContent: k });

export class Panel {
  private game = h('section');
  private settings = h('section');

  constructor(root: HTMLElement, private app: Controller) {
    this.buildSettings();
    const mute = btn('🔊 Sonido', () => { mute.textContent = this.app.sfx.toggleMute() ? '🔇 Mute' : '🔊 Sonido'; });
    root.replaceChildren(
      h('header', {}, h('h2', { textContent: '¿MAYOR O MENOR? · Panel' }), h('span', { className: 'muted', textContent: 'P oculta' })),
      this.game,
      this.settings,
      h('section', {}, h('h3', { textContent: 'Grabación' }),
        h('div', { className: 'line' },
          btn('⬛ Cuadro / reel', () => document.body.classList.toggle('cuadro')),
          btn('Guías', () => document.body.classList.toggle('clean')),
          mute)),
      h('footer', {},
        'Inicio: ', kbd('←'), ' altura · ', kbd('→'), ' peso. Juego: ', kbd('←'), ' / ', kbd('→'), ' elegir · ',
        kbd('Enter'), ' continuar/saltar · ', kbd('N'), ' otra pareja · ', kbd('A'), ' repetir · ',
        kbd('U'), ' deshacer · ', kbd('+/−'), ' puntaje · ', kbd('Esc'), ' inicio · ',
        kbd('R'), ' 1:1 · ', kbd('G'), ' guías · ', kbd('M'), ' mute · ',
        h('a', { href: 'creditos.html', target: '_blank', textContent: 'Créditos de los retratos' })),
    );
  }

  /** Rondas y diferencias: se aplican a la próxima partida. */
  private buildSettings() {
    const cfg = this.app.config;
    const total = h('input', { type: 'number', min: '0', max: '99', value: String(cfg.totalRounds) });
    const minR = h('input', { type: 'number', step: '0.05', min: '1.01', value: String(cfg.rules.minRatio) });
    const maxR = h('input', { type: 'number', step: '0.5', min: '1.1', value: String(cfg.rules.maxRatio) });
    const apply = () => {
      this.app.config = {
        totalRounds: Math.max(0, Math.round(Number(total.value) || 0)),
        rules: { ...cfg.rules, minRatio: Math.max(1.01, Number(minR.value) || 1.15), maxRatio: Math.max(1.1, Number(maxR.value) || 8) },
      };
    };
    for (const el of [total, minR, maxR]) el.addEventListener('change', apply);
    this.settings.replaceChildren(h('h3', { textContent: 'Próxima partida' }),
      h('label', { textContent: 'Rondas (0 = sin final) · diferencia mínima × · máxima ×' }),
      h('div', { className: 'line' }, total, minR, maxR));
  }

  refresh() {
    const s = this.app.session;
    if (!s) {
      this.game.replaceChildren(h('h3', { textContent: 'Inicio' }),
        h('div', { className: 'muted', textContent: 'Elegí el modo de la partida:' }),
        h('div', { className: 'line mt' },
          btn('📏 Altura', () => this.app.chooseMode('height'), 'primary'),
          btn('⚖ Peso', () => this.app.chooseMode('weight'), 'primary')));
      return;
    }
    const r = s.round;
    this.game.replaceChildren(h('h3', { textContent: `Partida · ${CATEGORY_LABEL[s.category]}` }),
      h('div', { textContent: `Ronda ${r.no}${s.config.totalRounds ? `/${s.config.totalRounds}` : ''} · fase: ${s.phase}` }),
      h('div', { className: 'muted', textContent: `◀ ${r.a.name} · ${r.b.name} ▶` }),
      // La respuesta queda plegada: el panel puede salir en cámara por accidente.
      h('details', {}, h('summary', { textContent: 'Ver respuesta' }),
        h('div', { className: 'muted', textContent: `${r.a.name}: ${formatValue(r.a.height, 'height')} · ${formatValue(r.a.weight, 'weight')}` }),
        h('div', { className: 'muted', textContent: `${r.b.name}: ${formatValue(r.b.height, 'height')} · ${formatValue(r.b.weight, 'weight')}` }),
        h('div', { className: 'answer', textContent: `Respuesta: ${pickedName(r, correctGuess(r.a, r.b, s.category))}` })),
      h('div', { className: 'line mt' },
        btn('▶ Continuar', () => this.app.next(), 'primary'),
        btn('🎲 Otra pareja', () => this.app.reroll()),
        btn('↺ Repetir animación', () => this.app.replay())),
      h('div', { className: 'line mt' },
        btn('↶ Deshacer', () => this.app.undo()),
        btn('−', () => this.app.adjustScore(-1)),
        h('span', { className: 'score', textContent: String(s.score) }),
        btn('+', () => this.app.adjustScore(1)),
        btn('⌂ Volver al inicio', () => this.app.toMenu(), 'danger')));
  }
}
