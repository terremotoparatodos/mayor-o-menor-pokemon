// Carteles HTML que siguen a cada modelo durante la revelación (nombre + valor que se va contando).
import { formatValue } from '../game/format';
import { valueOf } from '../game/rounds';
import type { Round } from '../game/types';

export class LabelLayer {
  private els: [HTMLElement, HTMLElement];
  private round: Round | null = null;
  private last = ['', ''];

  constructor(private root: HTMLElement) {
    const make = (side: string) => {
      const el = document.createElement('div');
      el.className = `tag tag-${side}`;
      el.innerHTML = '<div class="tag-name outline-s"></div><div class="tag-value outline-s"></div>';
      root.append(el);
      return el;
    };
    this.els = [make('a'), make('b')];
  }

  show(round: Round) {
    this.round = round;
    const [a, b] = this.els;
    a.querySelector('.tag-name')!.textContent = round.a.name;
    b.querySelector('.tag-name')!.textContent = round.b.name;
    for (const el of this.els) el.classList.remove('final');
    this.last = ['', ''];
    this.root.classList.add('on');
  }

  hide() {
    this.root.classList.remove('on');
    this.round = null;
  }

  /** pA/pB: avance de la medición de cada uno (0..1). Los dos valores se van contando. */
  setProgress(pA: number, pB: number) {
    const r = this.round;
    if (!r) return;
    [pA, pB].forEach((p, i) => {
      const v = valueOf(i === 0 ? r.a : r.b, r.category);
      const done = p >= 1 - 1e-9;
      const text = p <= 0 ? `? ${r.category === 'height' ? 'm' : 'kg'}`
        : formatValue(done ? v : Math.round(v * p * 10) / 10, r.category);
      const key = `${text}|${done}`;
      if (key === this.last[i]) return;
      this.last[i] = key;
      const el = this.els[i];
      el.querySelector('.tag-value')!.textContent = text;
      el.classList.toggle('final', done);
    });
  }

  place(a: { x: number; y: number }, b: { x: number; y: number }) {
    const pos = [a, b];
    this.els.forEach((el, i) => {
      // Que no se salgan del cuadro: se acotan a los bordes del canvas.
      const x = Math.min(this.root.clientWidth - 150, Math.max(150, pos[i].x));
      const y = Math.max(110, pos[i].y);
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    });
  }
}
