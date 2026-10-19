// Revelación en 2D con los recuadros de retrato de Mystery Dungeon.
// Los recuadros salen de las cartas, caen al escenario y aguantan el suspenso. Nunca cambian de tamaño
// (eso adelantaría la respuesta): todo se define de golpe en un solo instante.
//   altura → cada recuadro sale disparado sobre una columna ∝ metros, contra una pared de medición;
//   peso   → el balancín golpea hacia el más pesado.
// La línea de tiempo es una función pura de t: saltar al final o repetir es exacto.
import { formatValue } from '../game/format';
import type { Round } from '../game/types';
import type { LabelLayer } from './labels';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Con rebote: se pasa un poco del final y vuelve. */
const easeOutBack = (x: number) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeIn = (x: number) => x * x;
const span = (t: number, from: number, dur: number) => clamp01((t - from) / dur);

/** Momentos de la animación (segundos). Entre `drop` y `snap` hay suspenso con los dos iguales. */
export const TIMELINE = {
  drop: 0.7,
  snap: 2.2,
  snapDur: 0.28,
  height: { countDur: 0.35, end: 3.6 },
  weight: { tiltDur: 1.0, end: 3.6 },
};

export type Beat = 'land' | 'snap';

const W = 1080;
const FLOOR = 728;
/** Tamaño de los recuadros en el escenario: igual para los dos, siempre. */
const BOX = 230;
/** Altura de la columna del más alto (px). */
const MAX_COLUMN = 360;
const GAP = 150;
const PIVOT = { x: W / 2, y: 610 };
const BEAM = { half: 470, thick: 22, arm: 290 };

interface Rect { x: number; y: number; size: number }

interface Pose { x: number; y: number; size: number; rot: number; sx: number; sy: number }

export class Comparison {
  private boxes: [HTMLElement, HTMLElement];
  private bars: [HTMLElement, HTMLElement];
  private wall: HTMLElement;
  private refLine: HTMLElement;
  private beam: HTMLElement;
  private round: Round | null = null;
  private from: [Rect, Rect] = [{ x: 280, y: 330, size: BOX }, { x: 800, y: 330, size: BOX }];
  private t = 0;
  private playing = false;
  private silent = false;
  private onDone: (() => void) | null = null;
  private token = 0;

  constructor(readonly root: HTMLElement, private labels: LabelLayer, private onBeat: (b: Beat) => void) {
    const el = (cls: string, html = '') => {
      const d = document.createElement('div');
      d.className = cls;
      d.innerHTML = html;
      root.append(d);
      return d;
    };
    this.wall = el('cmp-wall');
    el('cmp-fulcrum');
    this.beam = el('cmp-beam');
    this.bars = [el('cmp-bar a'), el('cmp-bar b')];
    this.refLine = el('cmp-ref');
    this.boxes = [el('cmp-box a', '<img alt="" draggable="false">'), el('cmp-box b', '<img alt="" draggable="false">')];
    root.append(el('cmp-floor'));
  }

  get preparedFor() { return this.round; }

  /** Carga los dos retratos de la ronda (rechaza si falta alguno). */
  async prepare(round: Round): Promise<void> {
    const token = ++this.token;
    const imgs = this.boxes.map((b) => b.querySelector('img')!);
    const urls = [round.a, round.b].map((s) => `${import.meta.env.BASE_URL}portraits/${s.dex}.png`);
    await Promise.all(urls.map((u) => { const i = new Image(); i.src = u; return i.decode(); }));
    if (token !== this.token) return;
    imgs.forEach((img, i) => { img.src = urls[i]; img.alt = i === 0 ? round.a.name : round.b.name; });
    this.round = round;
    this.buildWall();
    this.t = 0;
    this.playing = false;
  }

  /** Dónde estaban los recuadros en las cartas (coordenadas del escenario), para salir desde ahí. */
  setOrigin(a: Rect, b: Rect) { this.from = [a, b]; }

  play(onDone: () => void) { this.start(0, onDone, false); }
  replay() { this.start(0, null, false); }
  showFinal() { this.start(this.end(), null, true); }

  /** Salta al final (Enter durante la revelación) sin disparar todos los sonidos juntos. */
  skip() {
    if (!this.playing || !this.round) return;
    this.silent = true;
    this.t = this.end();
  }

  hide() {
    this.playing = false;
    this.onDone = null;
    this.root.classList.remove('on');
    this.labels.hide();
  }

  private start(t: number, onDone: (() => void) | null, silent: boolean) {
    if (!this.round) return;
    this.t = t;
    this.silent = silent;
    this.playing = true;
    this.onDone = onDone;
    this.root.classList.add('on');
    this.root.classList.toggle('weight', this.round.category === 'weight');
    this.labels.show(this.round);
    this.layout(t);
  }

  private end() {
    return this.round?.category === 'weight' ? TIMELINE.weight.end : TIMELINE.height.end;
  }

  frame(dt: number) {
    if (!this.round || !this.playing) return;
    const prev = this.t;
    this.t = Math.min(this.end(), this.t + dt);
    if (!this.silent) for (const [at, beat] of this.beats()) if (prev < at && at <= this.t) this.onBeat(beat);
    this.layout(this.t);
    if (this.t >= this.end() && this.onDone) {
      const done = this.onDone;
      this.onDone = null;
      done();
    }
  }

  /** Momentos con sonido/sacudón: el aterrizaje y el salto a escala real. */
  private beats(): [number, Beat][] {
    return [[TIMELINE.drop, 'land'], [TIMELINE.snap, 'snap']];
  }

  private buildWall() {
    const r = this.round!;
    this.wall.replaceChildren();
    if (r.category !== 'height') return;
    const maxH = Math.max(r.a.height, r.b.height);
    const pxPerM = MAX_COLUMN / maxH;
    const step = niceStep(maxH * 1.3, 6);
    for (let i = 1; FLOOR - i * step * pxPerM > 40; i++) {
      const v = i * step;
      const line = document.createElement('div');
      line.className = `cmp-line${i % 2 === 0 ? ' major' : ''}`;
      line.style.top = `${FLOOR - v * pxPerM}px`;
      const label = formatValue(v, 'height').replace(',0 ', ' ');
      line.innerHTML = '<span></span><span></span>';
      for (const s of line.querySelectorAll('span')) s.textContent = label;
      this.wall.append(line);
    }
  }

  private layout(t: number) {
    const r = this.round!;
    const T = TIMELINE;
    // Golpe: todo se define en el mismo instante, con rebote (se pasa un poco y vuelve).
    const snap = easeOutBack(span(t, T.snap, T.snapDur));
    const drop = span(t, 0, T.drop);
    // Aplastado al aterrizar: rebote corto.
    const squash = (at: number, amount: number) => {
      const k = span(t, at, 0.28);
      if (k <= 0 || k >= 1) return { sx: 1, sy: 1 };
      const w = Math.sin(k * Math.PI) * amount * (1 - k);
      return { sx: 1 + w, sy: 1 - w };
    };
    // Suspenso: los dos tiemblan cada vez más hasta el salto.
    const tension = t > T.drop + 0.3 && t < T.snap ? span(t, T.drop + 0.3, T.snap - T.drop - 0.3) : 0;
    const jitter = (i: number) => tension * tension * 7 * Math.sin(t * 55 + i * 2.1);
    const land = squash(T.drop, 0.22);
    const hit = squash(T.snap + T.snapDur * 0.6, 0.16);
    const after = clamp01((t - T.snap) / 0.15);

    let poses: [Pose, Pose];
    if (r.category === 'height') {
      const xA = W / 2 - GAP / 2 - BOX / 2;
      const xB = W / 2 + GAP / 2 + BOX / 2;
      const top = Math.max(r.a.height, r.b.height);
      const low = Math.min(r.a.height, r.b.height);
      const pxPerM = MAX_COLUMN / top;
      // Las columnas salen disparadas juntas: cada recuadro queda apoyado a su altura en metros.
      const cA = r.a.height * pxPerM * snap, cB = r.b.height * pxPerM * snap;
      poses = [
        this.dropPose(0, drop, { x: xA + jitter(0), y: FLOOR - cA }, BOX, land, hit),
        this.dropPose(1, drop, { x: xB + jitter(1), y: FLOOR - cB }, BOX, land, hit),
      ];
      this.wall.style.opacity = String(after);
      this.placeColumn(this.bars[0], xA, cA, after);
      this.placeColumn(this.bars[1], xB, cB, after);
      const lineK = easeOut(span(t, T.snap + 0.25, 0.3));
      this.refLine.style.opacity = String(lineK);
      this.refLine.className = `cmp-ref ${r.a.height < r.b.height ? 'a' : 'b'}`;
      this.refLine.style.transform = `translate(40px, ${FLOOR - low * pxPerM}px) scaleX(${lineK})`;
      const count = easeOut(span(t, T.snap, T.height.countDur));
      this.labels.setProgress(count, count);
    } else {
      const tilt = span(t, T.snap, T.weight.tiltDur);
      // Muelle duro: el balancín golpea hacia el más pesado, se pasa y se asienta rápido.
      const spring = tilt > 0 ? 1 - Math.exp(-6 * tilt) * Math.cos(13 * tilt) : 0;
      const wr = Math.log10(r.b.weight / r.a.weight);
      const ang = Math.sign(wr) * Math.min(0.2, 0.07 + 0.09 * Math.abs(wr)) * spring;
      const onBeam = (lx: number) => ({
        x: PIVOT.x + lx * Math.cos(ang) + (BEAM.thick / 2) * Math.sin(ang),
        y: PIVOT.y + lx * Math.sin(ang) - (BEAM.thick / 2) * Math.cos(ang),
      });
      const pA = this.dropPose(0, drop, onBeam(-BEAM.arm), BOX, land, hit);
      const pB = this.dropPose(1, drop, onBeam(BEAM.arm), BOX, land, hit);
      pA.x += jitter(0);
      pB.x += jitter(1);
      pA.rot = pB.rot = ang;
      poses = [pA, pB];
      this.beam.style.transform = `translate(${PIVOT.x - BEAM.half}px, ${PIVOT.y - BEAM.thick / 2}px) rotate(${ang}rad)`;
      const count = easeOut(span(t, T.snap + 0.05, 0.4));
      this.labels.setProgress(count, count);
    }

    poses.forEach((p, i) => {
      const el = this.boxes[i];
      el.style.width = el.style.height = `${p.size}px`;
      el.style.transform = `translate(${p.x - p.size / 2}px, ${p.y - p.size}px) rotate(${p.rot}rad) scale(${p.sx}, ${p.sy})`;
    });
    // Carteles sobre el borde superior de cada recuadro (girado con el balancín).
    const tops = poses.map((p) => ({ x: p.x + Math.sin(p.rot) * p.size * p.sy, y: p.y - Math.cos(p.rot) * p.size * p.sy - 12 }));
    this.labels.place(tops[0], tops[1]);
  }

  /** Vuelo desde la carta hasta su lugar: horizontal suave, vertical con "gravedad". */
  private dropPose(i: number, k: number, to: { x: number; y: number }, size: number, land: { sx: number; sy: number }, extra: { sx: number; sy: number }): Pose {
    const from = this.from[i];
    const fromBottom = from.y + from.size / 2;
    return {
      x: lerp(from.x, to.x, easeOut(k)),
      y: lerp(fromBottom, to.y, easeIn(k)),
      size: k < 1 ? lerp(from.size, size, k) : size,
      rot: 0,
      sx: land.sx * extra.sx,
      sy: land.sy * extra.sy,
    };
  }

  /** Columna bajo un recuadro, del piso hasta su altura. */
  private placeColumn(col: HTMLElement, cx: number, h: number, opacity: number) {
    const w = BOX - 60;
    col.style.opacity = String(opacity);
    col.style.width = `${w}px`;
    col.style.height = `${Math.max(0, h)}px`;
    col.style.transform = `translate(${cx - w / 2}px, ${FLOOR - h}px)`;
  }

}

/** Paso "lindo" para las líneas de la pared: 0,1 · 0,2 · 0,5 · 1 · 2 · 5 · 10 m… */
export function niceStep(spanM: number, targetLines = 6) {
  const raw = spanM / targetLines;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}
