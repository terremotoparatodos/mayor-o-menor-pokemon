// Escena 3D de la revelación: los dos modelos de Cobblemon arrancan del MISMO tamaño (como los retratos)
// y se transforman a su escala real. Altura → pared de medición y barras; peso → balancín.
// La línea de tiempo es una función pura de t: saltar al final o repetir es exacto.
import * as THREE from 'three';
import { AnimatedPokemon, loadSpecies } from '../models/pokemonModel';
import type { Category, Round } from '../game/types';
import { blobShadowTexture, floorTexture, measureWallTexture, niceStep } from './textures';
import type { LabelLayer } from './labels';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeOutBack = (x: number) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2;
const span = (t: number, from: number, dur: number) => clamp01((t - from) / dur);

/** Momentos de la animación (segundos). */
export const TIMELINE = {
  appear: 0.5,
  morphStart: 1.4,
  morphDur: 2.3,
  /** Una sola medición sube para los dos a la misma velocidad: el más bajo se frena primero. */
  height: { wall: 3.8, sweep: 4.0, sweepDur: 2.6, end: 7.2 },
  weight: { tilt: 4.0, tiltDur: 2.0, end: 6.4 },
};

interface Side {
  poke: AnimatedPokemon;
  shadow: THREE.Mesh;
  bar: THREE.Mesh;
  real: number;
}

const COLOR_A = 0xffd84a;
/** Grosor de las barras de medición, relativo a la altura mayor. */
const BAR_W = 0.03;

/** Dos Pokémon uno al lado del otro (A a la izquierda) con sus barras por fuera. */
function sideBySide(wA: number, wB: number, hm: number, barW: number) {
  const gap = hm * 0.35 + Math.max(wA, wB) * 0.1;
  const xA = -(gap / 2 + wA / 2);
  const xB = gap / 2 + wB / 2;
  return { xA, xB, minX: xA - wA / 2 - barW * 3, maxX: xB + wB / 2 + barW * 3 };
}
const COLOR_B = 0x5b8cff;

export class CompareScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(24, 1, 0.01, 5000);
  private root = new THREE.Group();
  private floor: THREE.Mesh;
  private wall: THREE.Mesh;
  private refLine: THREE.Mesh;
  private seesaw = new THREE.Group();
  private beam: THREE.Mesh;
  private fulcrum: THREE.Mesh;
  private sides: [Side, Side] | null = null;
  private round: Round | null = null;
  private t = 0;
  private playing = false;
  private onDone: (() => void) | null = null;
  private shadowTex = blobShadowTexture();
  private token = 0;

  constructor(readonly canvas: HTMLCanvasElement, private labels: LabelLayer, private width: number, private height: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2418, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(0.6, 1, 0.9);
    this.scene.add(sun);
    this.scene.add(this.root);

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: floorTexture(), transparent: true, depthWrite: false }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.renderOrder = -2;
    this.root.add(this.floor);

    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    this.wall.renderOrder = -3;
    this.root.add(this.wall);

    this.refLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: COLOR_A, transparent: true, opacity: 0 }));
    this.root.add(this.refLine);

    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.8 });
    this.beam = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wood);
    this.fulcrum = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 4), new THREE.MeshStandardMaterial({ color: 0x5a5f78, roughness: 0.6 }));
    this.fulcrum.rotation.y = Math.PI / 4;
    this.seesaw.add(this.beam, this.fulcrum);
    this.root.add(this.seesaw);
    this.root.visible = false;
  }

  /** Carga los dos modelos de la ronda. Rechaza si falta alguno (el llamador cambia el rival). */
  async prepare(round: Round): Promise<void> {
    const token = ++this.token;
    const [ma, mb] = await Promise.all([loadSpecies(round.a.dex), loadSpecies(round.b.dex)]);
    if (token !== this.token) return;
    this.disposeSides();
    const make = (assets: typeof ma, real: number, color: number): Side => {
      const poke = new AnimatedPokemon(assets, real);
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.renderOrder = -1;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color }));
      this.root.add(poke.object, shadow, bar);
      return { poke, shadow, bar, real };
    };
    // Las alturas reales SIEMPRE son las de la Pokédex (el peso sólo cambia la puesta en escena).
    this.sides = [make(ma, round.a.height, COLOR_A), make(mb, round.b.height, COLOR_B)];
    this.round = round;
    this.buildWall();
    this.playing = false;
    this.t = 0;
  }

  get ready() {
    return this.sides !== null;
  }

  get preparedFor() {
    return this.round;
  }

  play(onDone: () => void) {
    if (!this.sides || !this.round) return;
    this.root.visible = true;
    this.t = 0;
    this.playing = true;
    this.onDone = onDone;
    this.labels.show(this.round);
  }

  /** Salta al final de la animación (Enter durante la revelación). */
  skip() {
    if (this.playing && this.round) this.t = this.endTime(this.round.category);
  }

  /** Vuelve a reproducir la animación sin volver a avisar el resultado. */
  replay() {
    if (!this.sides || !this.round) return;
    this.root.visible = true;
    this.t = 0;
    this.playing = true;
    this.onDone = null;
    this.labels.show(this.round);
  }

  hide() {
    this.playing = false;
    this.onDone = null;
    this.root.visible = false;
    this.labels.hide();
  }

  /** Deja la escena en su estado final (al deshacer/rehacer o si se recarga el resultado). */
  showFinal() {
    if (!this.sides || !this.round) return;
    this.root.visible = true;
    this.t = this.endTime(this.round.category);
    this.playing = true;
    this.onDone = null;
    this.labels.show(this.round);
  }

  private endTime(c: Category) {
    return c === 'height' ? TIMELINE.height.end : TIMELINE.weight.end;
  }

  /** La pared se dibuja para el encuadre FINAL (escala real), así las etiquetas entran en el cuadro. */
  private buildWall() {
    const [a, b] = this.sides!;
    const maxH = Math.max(a.real, b.real);
    const { minX, maxX } = sideBySide(a.poke.width, b.poke.width, maxH, maxH * BAR_W);
    const frameH = this.frameHeight(minX, maxX, maxH);
    const wallW = frameH * this.camera.aspect * 0.94;
    const wallH = frameH * 0.95;
    const step = niceStep(maxH * 1.25, 6);
    const mat = this.wall.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.map = measureWallTexture(wallW, wallH, step);
    mat.needsUpdate = true;
    this.wall.scale.set(wallW, wallH, 1);
    this.wall.position.set((minX + maxX) / 2, wallH / 2, -Math.max(a.poke.depth, b.poke.depth) * 0.6 - maxH * 0.05);
  }

  frame(dt: number) {
    if (!this.sides || !this.round || !this.root.visible) return;
    const end = this.endTime(this.round.category);
    if (this.playing) {
      this.t = Math.min(end, this.t + dt);
      if (this.t >= end && this.onDone) {
        const done = this.onDone;
        this.onDone = null;
        // Grita el ganador (el más alto / más pesado).
        const r = this.round;
        const bWins = r.category === 'height' ? r.b.height > r.a.height : r.b.weight > r.a.weight;
        this.sides[bWins ? 1 : 0].poke.playOnce('cry');
        done();
      }
    }
    for (const s of this.sides) s.poke.update(dt);
    this.layout(this.t);
    this.renderer.render(this.scene, this.camera);
  }

  /** Coloca todo para el instante t. */
  private layout(t: number) {
    const [A, B] = this.sides!;
    const r = this.round!;
    const T = TIMELINE;
    const appear = easeOutBack(span(t, 0, T.appear));
    const morph = easeInOut(span(t, T.morphStart, T.morphDur));
    // Arranque: ambos con la media geométrica de sus alturas (no delata a nadie). Final: 1 = escala real.
    const g = Math.sqrt(A.real * B.real);
    const kA = (g / A.real) ** (1 - morph) * Math.max(0.001, appear);
    const kB = (g / B.real) ** (1 - morph) * Math.max(0.001, appear);
    const hA = A.real * kA, hB = B.real * kB;
    const wA = A.poke.width * kA, wB = B.poke.width * kB;
    const hm = Math.max(hA, hB, 1e-3);
    const isHeight = r.category === 'height';
    const barW = Math.max(A.real, B.real) * BAR_W;
    let { xA, xB, minX, maxX } = sideBySide(wA, wB, hm, isHeight ? barW : 0);
    let yA = 0, yB = 0;
    let maxY = hm;

    this.seesaw.visible = !isHeight;
    this.wall.visible = isHeight;

    if (isHeight) {
      const H = T.height;
      this.refLine.visible = true;
      const wallK = span(t, H.wall, 0.5);
      (this.wall.material as THREE.MeshBasicMaterial).opacity = wallK;
      const top = Math.max(A.real, B.real);
      const low = Math.min(A.real, B.real);
      const sweep = top * easeInOut(span(t, H.sweep, H.sweepDur));
      const bA = Math.min(A.real, sweep), bB = Math.min(B.real, sweep);
      this.placeBar(A.bar, xA - wA / 2 - barW * 1.6, bA, barW, wallK);
      this.placeBar(B.bar, xB + wB / 2 + barW * 1.6, bB, barW, wallK);
      // Cuando el más bajo se frena, una línea marca su altura de punta a punta.
      const lineK = clamp01((sweep - low) / (top * 0.12));
      const lm = this.refLine.material as THREE.MeshBasicMaterial;
      lm.color.setHex(A.real < B.real ? COLOR_A : COLOR_B);
      lm.opacity = 0.85 * lineK;
      const lw = (maxX - minX) * lineK;
      this.refLine.scale.set(Math.max(1e-4, lw), barW * 0.35, 1);
      this.refLine.position.set(minX + lw / 2, low, 0.01);
      this.labels.setProgress(bA / A.real, bB / B.real);
    } else {
      const W = T.weight;
      A.bar.visible = B.bar.visible = false;
      this.refLine.visible = false;
      const tilt = span(t, W.tilt, W.tiltDur);
      // Muelle amortiguado: inclina hacia el más pesado, se pasa un poco y se asienta.
      const spring = 1 - Math.exp(-5 * tilt) * Math.cos(9 * tilt);
      const wr = Math.log10(r.b.weight / r.a.weight);
      const target = -Math.sign(wr) * Math.min(0.32, 0.1 + 0.11 * Math.abs(wr));
      const half = Math.max(-minX, maxX) * 1.08;
      const thick = Math.max(hm * 0.06, half * 0.035);
      const fh = Math.max(hm * 0.35, half * 0.24);
      // Nunca más inclinado de lo que permite el pivote (el tablón no atraviesa el piso).
      const maxAng = Math.asin(Math.min(0.95, (fh * 0.85) / half));
      const ang = Math.sign(target) * Math.min(Math.abs(target), maxAng) * (tilt > 0 ? spring : 0);
      this.fulcrum.scale.set(fh * 0.9, fh, fh * 0.9);
      this.fulcrum.position.set(0, fh / 2, 0);
      this.beam.scale.set(half * 2, thick, Math.min(hm * 0.5, Math.max(A.poke.depth * kA, B.poke.depth * kB, hm * 0.2)));
      this.beam.position.set(0, fh + thick / 2, 0);
      this.beam.rotation.z = ang;
      const top = fh + thick;
      // Punto de la cara superior del tablón en la coordenada local x, ya girado.
      const onBeam = (x: number) => ({
        x: x * Math.cos(ang) - (thick / 2) * Math.sin(ang),
        y: fh + thick / 2 + x * Math.sin(ang) + (thick / 2) * Math.cos(ang),
      });
      ({ x: xA, y: yA } = onBeam(xA));
      ({ x: xB, y: yB } = onBeam(xB));
      minX = -half;
      maxX = half;
      maxY = Math.max(yA + hA, yB + hB, top);
      this.labels.setProgress(easeOut(tilt), easeOut(tilt));
    }

    // Entrada: cada uno aparece girando hacia el centro.
    const spin = (1 - easeOut(span(t, 0, 0.8))) * 2.6;
    this.placePoke(A, xA, yA, kA, 0.35 - spin, isHeight);
    this.placePoke(B, xB, yB, kB, -0.35 + spin, isHeight);
    const floorW = (maxX - minX) * 1.6;
    this.floor.scale.set(floorW, floorW * 0.55, 1);
    this.floor.position.set((minX + maxX) / 2, 0.001, 0);

    this.fitCamera(minX, maxX, maxY);
    this.labels.place(this.project(xA, yA + hA), this.project(xB, yB + hB));
  }

  private placePoke(s: Side, x: number, y: number, k: number, yaw: number, grounded: boolean) {
    s.poke.object.position.set(x, y, 0);
    s.poke.object.scale.setScalar(k);
    s.poke.object.rotation.y = yaw;
    const w = Math.max(s.poke.width, s.poke.depth) * k * 1.3;
    s.shadow.visible = grounded;
    s.shadow.scale.set(w, w * 0.6, 1);
    s.shadow.position.set(x, 0.002, 0);
  }

  private placeBar(bar: THREE.Mesh, x: number, h: number, w: number, opacity: number) {
    bar.visible = h > 1e-4 && opacity > 0;
    bar.scale.set(w, Math.max(1e-4, h), w);
    bar.position.set(x, h / 2, 0);
  }

  /** Alto de cuadro que entra todo (con margen arriba para las etiquetas). */
  private frameHeight(minX: number, maxX: number, maxY: number) {
    return Math.max(maxY * 1.55, ((maxX - minX) * 1.15) / this.camera.aspect);
  }

  private fitCamera(minX: number, maxX: number, maxY: number) {
    const fov = (this.camera.fov * Math.PI) / 180;
    const frameH = this.frameHeight(minX, maxX, maxY);
    const dist = frameH / 2 / Math.tan(fov / 2);
    // Piso a 13 % del borde inferior; si sobra alto (escena ancha), el contenido sube al centro.
    const bottom = Math.min(frameH * 0.28, Math.max(frameH * 0.13, (frameH - maxY * 1.35) / 2));
    const lookY = frameH / 2 - bottom;
    const cx = (minX + maxX) / 2;
    this.camera.position.set(cx, lookY + dist * 0.05, dist);
    this.camera.lookAt(cx, lookY, 0);
    this.camera.near = dist * 0.05;
    this.camera.far = dist * 4;
    this.camera.updateProjectionMatrix();
  }

  private v = new THREE.Vector3();
  /** Punto 3D → píxeles dentro del canvas. */
  private project(x: number, y: number) {
    this.v.set(x, y, 0).project(this.camera);
    return { x: ((this.v.x + 1) / 2) * this.width, y: ((1 - this.v.y) / 2) * this.height };
  }

  private disposeSides() {
    if (!this.sides) return;
    for (const s of this.sides) {
      s.poke.dispose();
      s.shadow.removeFromParent();
      s.bar.removeFromParent();
      (s.shadow.material as THREE.Material).dispose();
      (s.bar.material as THREE.Material).dispose();
    }
    this.sides = null;
  }
}
