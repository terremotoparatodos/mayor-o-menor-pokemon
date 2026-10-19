// Pinta el cuadro 1080×1080: inicio (elegir modo), marcador, pregunta, cartas PMD, botones y carteles.
// Sólo DOM; no decide nada del juego. Las transiciones son clases de estado en .stage (ver styles.css).
import { CATEGORY_LABEL, QUESTION, pickedName } from '../game/format';
import type { Session } from '../game/session';
import type { Category, Guess, Species } from '../game/types';

const $ = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector<T>(sel)!;
const portraitUrl = (s: Species) => `${import.meta.env.BASE_URL}portraits/${s.dex}.png`;

/** Reinicia una animación CSS de una clase. */
function replay(el: Element, cls: string) {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

export interface ViewHandlers {
  onGuess(g: Guess): void;
  onMode(c: Category): void;
}

export type StageState = 'menu' | 'guess' | 'picked' | 'reveal' | 'leaving';

export class SquareView {
  readonly stage: HTMLElement;
  private lastScore = 0;
  private lastQuestion = '';

  constructor(private root: HTMLElement, h: ViewHandlers) {
    this.stage = $(root, '.stage');
    for (const el of root.querySelectorAll<HTMLElement>('[data-guess], .pcard')) {
      el.addEventListener('click', () => h.onGuess((el.dataset.guess ?? el.dataset.side) as Guess));
    }
    for (const el of root.querySelectorAll<HTMLElement>('.mode-btn')) {
      el.addEventListener('click', () => h.onMode(el.dataset.mode as Category));
    }
  }

  /** Pantalla de inicio. */
  renderMenu() {
    this.resetMenu();
    this.setStage('menu');
    $(this.root, '.pscore').textContent = '0';
    this.lastScore = 0;
    $(this.root, '.mode-name').textContent = '—';
    $(this.root, '.round-no').textContent = '';
    $(this.root, '.progress').replaceChildren();
    this.setQuestion('ELEGÍ EL MODO');
    this.showStamp(null);
  }

  render(s: Session) {
    const r = s.round;
    const score = $(this.root, '.pscore');
    score.textContent = String(s.score);
    if (s.score > this.lastScore) { replay(score, 'bump'); replay($(this.root, '.plus'), 'go'); }
    this.lastScore = s.score;
    $(this.root, '.mode-name').textContent = CATEGORY_LABEL[s.category];
    const total = s.config.totalRounds;
    $(this.root, '.round-no').textContent = total > 0 ? `RONDA ${r.no}/${total}` : `RONDA ${r.no}`;
    this.renderProgress(s);
    this.setQuestion(s.phase === 'over' ? '¡FIN DE LA PARTIDA!' : QUESTION[s.category]);
    this.renderCards(s);

    $(this.root, '.choice.pick-a .lbl').textContent = r.a.name;
    $(this.root, '.choice.pick-b .lbl').textContent = r.b.name;
    for (const side of ['a', 'b'] as const) {
      $(this.root, `.choice.pick-${side}`).classList.toggle('long', (side === 'a' ? r.a : r.b).name.length > 10);
    }

    const said = $(this.root, '.said');
    said.replaceChildren();
    if (s.outcome) {
      const b = document.createElement('b');
      b.className = s.outcome.guess;
      b.textContent = pickedName(r, s.outcome.guess);
      said.append('ELEGISTE A ', b);
    }
  }

  private setQuestion(text: string) {
    const q = $(this.root, '.q-text');
    if (text !== this.lastQuestion) {
      this.lastQuestion = text;
      q.textContent = text;
      replay(q, 'swap');
    }
    // Achica la letra hasta que entre en una línea.
    let size = 46;
    q.style.fontSize = `${size}px`;
    const max = q.parentElement!.clientWidth || 1032;
    while (q.scrollWidth > max && size > 18) q.style.fontSize = `${--size}px`;
  }

  private renderProgress(s: Session) {
    const el = $(this.root, '.progress');
    const total = s.config.totalRounds;
    el.style.display = total > 0 ? '' : 'none';
    if (total <= 0) return;
    el.replaceChildren(...Array.from({ length: total }, (_, i) => {
      const pip = document.createElement('i');
      if (i < s.results.length) pip.className = s.results[i] ? 'ok' : 'no';
      else if (i === s.round.no - 1 && s.phase !== 'over') pip.className = 'current';
      return pip;
    }));
  }

  private renderCards(s: Session) {
    const r = s.round;
    const unit = s.category === 'height' ? 'm' : 'kg';
    for (const [side, sp] of [['a', r.a], ['b', r.b]] as const) {
      const card = $(this.root, `.pcard[data-side="${side}"]`);
      const img = $<HTMLImageElement>(card, 'img');
      const url = portraitUrl(sp);
      if (!img.src.endsWith(url)) img.src = url;
      img.alt = sp.name;
      const name = $(card, '.pc-name');
      name.textContent = sp.name;
      name.classList.toggle('long', sp.name.length > 10);
      // Ninguno de los dos valores se ve antes de la revelación.
      $(card, '.pc-value').textContent = `? ${unit}`;
    }
  }

  /** Estado del escenario: cada clase define qué se ve y con qué transición (styles.css). */
  setStage(state: StageState, pick?: Guess) {
    const st = this.stage;
    st.classList.remove('menu', 'guess', 'picked', 'reveal', 'leaving', 'pick-a', 'pick-b');
    st.classList.add(state);
    if (state === 'picked' && pick) st.classList.add(`pick-${pick}`);
    if (state === 'leaving') st.classList.add('reveal');
  }

  /** Reparte las cartas (entrada de una ronda nueva). */
  deal() {
    replay($(this.root, '.cards'), 'deal');
    replay($(this.root, '.choices'), 'deal');
  }

  /** Elección de modo en el inicio: el botón elegido late, el otro se apaga. */
  pickMode(c: Category) {
    for (const el of this.root.querySelectorAll<HTMLElement>('.mode-btn')) {
      el.classList.toggle('chosen', el.dataset.mode === c);
      el.classList.toggle('dropped', el.dataset.mode !== c);
    }
    this.stage.classList.add('menu-out');
  }

  resetMenu() {
    for (const el of this.root.querySelectorAll('.mode-btn')) el.classList.remove('chosen', 'dropped');
    this.stage.classList.remove('menu-out');
  }

  setWaiting(on: boolean) { this.stage.classList.toggle('waiting', on); }

  flash(ok: boolean) {
    const f = $(this.root, '.flash');
    f.className = `flash ${ok ? 'ok' : 'no'}`;
    replay(f, 'go');
  }

  showStamp(s: Session | null) {
    const st = $(this.root, '.stamp');
    st.className = 'stamp outline-s';
    st.replaceChildren();
    this.root.classList.toggle('resulted', Boolean(s?.outcome) && s?.phase !== 'over');
    this.root.classList.toggle('over', s?.phase === 'over');
    if (!s) return;
    const small = (t: string) => { const n = document.createElement('small'); n.textContent = t; return n; };
    if (s.phase === 'over') {
      const total = s.config.totalRounds;
      st.classList.add('final');
      const big = document.createElement('b');
      big.textContent = total > 0 ? `${s.score}/${total}` : String(s.score);
      st.append(small('PUNTAJE FINAL'), big, small(CATEGORY_LABEL[s.category]));
    } else if (s.outcome) {
      st.classList.add(s.outcome.correct ? 'ok' : 'no');
      st.append(s.outcome.correct ? '¡CORRECTO!' : '¡NOOO!',
        small(s.outcome.correct ? '+1' : `ERA ${pickedName(s.round, s.outcome.answer)}`));
    }
    replay(st, 'show');
  }
}
