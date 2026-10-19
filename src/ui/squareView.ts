// Pinta el cuadro 1080×1080 a partir de la sesión: marcadores, pregunta, cartas PMD, botones y carteles.
// Sólo DOM; no decide nada del juego.
import { CATEGORY_LABEL, QUESTION, pickedName } from '../game/format';
import type { Session } from '../game/session';
import type { Guess, Species } from '../game/types';

const $ = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector<T>(sel)!;
const portraitUrl = (s: Species) => `${import.meta.env.BASE_URL}portraits/${s.dex}.png`;

export class SquareView {
  readonly stage: HTMLElement;
  private players: HTMLElement[];
  private lastScores: number[] = [];

  constructor(private root: HTMLElement, onGuess: (g: Guess) => void) {
    this.stage = $(root, '.stage');
    this.players = [...root.querySelectorAll<HTMLElement>('.player')];
    for (const btn of root.querySelectorAll<HTMLButtonElement>('.choice')) {
      btn.addEventListener('click', () => onGuess(btn.dataset.guess as Guess));
    }
    for (const card of root.querySelectorAll<HTMLElement>('.pcard')) {
      card.addEventListener('click', () => onGuess(card.dataset.side as Guess));
    }
  }

  render(s: Session) {
    const r = s.round;
    const solo = s.players.length === 1;
    $(this.root, '.head').classList.toggle('solo', solo);
    s.players.forEach((p, i) => {
      const el = this.players[i];
      $(el, '.pname').textContent = p.name;
      const score = $(el, '.pscore');
      score.textContent = String(p.score);
      if (this.lastScores[i] !== undefined && p.score > this.lastScores[i]) {
        score.classList.remove('bump');
        void score.offsetWidth;
        score.classList.add('bump');
      }
      el.classList.toggle('active', !solo && r.player === i && s.phase !== 'over');
    });
    this.lastScores = s.players.map((p) => p.score);

    const total = s.config.totalRounds;
    $(this.root, '.round-no').textContent = total > 0 ? `RONDA ${r.no}/${total}` : `RONDA ${r.no}`;
    const chip = $(this.root, '.chip.cat');
    chip.textContent = CATEGORY_LABEL[r.category];
    chip.className = `chip cat ${r.category}`;
    this.renderProgress(s);
    this.renderQuestion(s);
    this.renderCards(s);

    $(this.root, '.choice.pick-a .lbl').textContent = r.a.name;
    $(this.root, '.choice.pick-b .lbl').textContent = r.b.name;
    for (const side of ['a', 'b'] as const) {
      const long = (side === 'a' ? r.a : r.b).name.length > 10;
      $(this.root, `.choice.pick-${side}`).classList.toggle('long', long);
    }

    const said = $(this.root, '.said');
    said.replaceChildren();
    if (s.outcome) {
      const who = solo ? 'ELEGISTE A' : `${s.players[r.player].name} ELIGIÓ A`;
      const b = document.createElement('b');
      b.className = s.outcome.guess;
      b.textContent = pickedName(r, s.outcome.guess);
      said.append(`${who} `, b);
    }
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

  private renderQuestion(s: Session) {
    const r = s.round;
    const q = $(this.root, '.q-text');
    q.replaceChildren(s.phase === 'over' ? '¡FIN DE LA PARTIDA!' : QUESTION[r.category]);
    // Achica la letra hasta que entre en una línea.
    let size = 46;
    q.style.fontSize = `${size}px`;
    const max = q.parentElement!.clientWidth || 1032;
    while (q.scrollWidth > max && size > 18) q.style.fontSize = `${--size}px`;
  }

  private renderCards(s: Session) {
    const r = s.round;
    const cards = $(this.root, '.cards');
    const fill = (side: 'a' | 'b', sp: Species, value: string) => {
      const card = $(cards, `[data-side="${side}"]`);
      const img = $<HTMLImageElement>(card, 'img');
      const url = portraitUrl(sp);
      if (!img.src.endsWith(url)) img.src = url;
      img.alt = sp.name;
      const name = $(card, '.pc-name');
      name.textContent = sp.name;
      name.classList.toggle('long', sp.name.length > 10);
      $(card, '.pc-value').textContent = value;
    };
    const unit = r.category === 'height' ? 'm' : 'kg';
    // Ninguno de los dos valores se ve antes de la revelación.
    const key = `${r.no}:${r.a.dex}:${r.b.dex}:${r.category}`;
    if (cards.dataset.key !== key && s.phase === 'guess') {
      cards.dataset.key = key;
      cards.classList.remove('deal');
      void cards.offsetWidth;
      cards.classList.add('deal');
    }
    fill('a', r.a, `? ${unit}`);
    fill('b', r.b, `? ${unit}`);
  }

  setReveal(on: boolean) { this.stage.classList.toggle('reveal', on); }
  setWaiting(on: boolean) { this.stage.classList.toggle('waiting', on); }

  showStamp(s: Session | null) {
    const st = $(this.root, '.stamp');
    st.className = 'stamp outline-s';
    st.replaceChildren();
    this.root.classList.toggle('resulted', Boolean(s?.outcome) && s?.phase !== 'over');
    if (!s) return;
    const small = (t: string) => { const n = document.createElement('small'); n.textContent = t; return n; };
    if (s.phase === 'over') {
      const ps = s.players;
      const best = Math.max(...ps.map((p) => p.score));
      const winners = ps.filter((p) => p.score === best);
      st.classList.add('final');
      st.append(ps.length === 1 ? `${best} PUNTOS` : winners.length > 1 ? '¡EMPATE!' : `¡GANA ${winners[0].name}!`,
        small(ps.map((p) => `${p.name} ${p.score}`).join(' · ')));
    } else if (s.outcome) {
      const r = s.round;
      st.classList.add(s.outcome.correct ? 'ok' : 'no');
      st.append(s.outcome.correct ? '¡CORRECTO!' : '¡NOOO!',
        small(s.outcome.correct
          ? (s.players.length > 1 ? `+1 ${s.players[r.player].name}` : '+1')
          : `ERA ${pickedName(r, s.outcome.answer)}`));
    }
    void st.offsetWidth;
    st.classList.add('show');
  }
}
