// Carga de especies de Cobblemon (extraídas a public/cobblemon/<dex>/) y Pokémon animados en reposo.
// Adaptado de ¡Millón al Agua!: aquí sólo hacen falta reposo, parpadeo y animaciones sueltas (grito).
import * as THREE from 'three';
import { bakeStatic, buildTemplate, instantiateRig, type BuiltRig, type GeoFile, type GeoTemplate } from './bedrockGeometry';
import { applyPose, parseAnimations, Pose, type Clip } from './bedrockAnimation';

export interface SpeciesAssets {
  dex: number;
  template: GeoTemplate;
  material: THREE.MeshStandardMaterial;
  clips: Map<string, Clip>;
  /** Caja del modelo en reposo, en píxeles Bedrock. */
  box: THREE.Box3;
}

const cache = new Map<number, Promise<SpeciesAssets>>();
const texLoader = new THREE.TextureLoader();

async function load(dex: number): Promise<SpeciesAssets> {
  const base = `${import.meta.env.BASE_URL}cobblemon/${dex}/`;
  const [geo, anim, tex] = await Promise.all([
    fetch(`${base}model.geo.json`).then((r) => {
      if (!r.ok) throw new Error(`Falta el modelo #${dex}. Corré "npm run models".`);
      return r.json() as Promise<GeoFile>;
    }),
    fetch(`${base}anim.json`).then((r) => (r.ok ? r.json() : { animations: {} })).catch(() => ({ animations: {} })),
    texLoader.loadAsync(`${base}texture.png`),
  ]);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
  const template = buildTemplate(geo);
  const baked = bakeStatic(template);
  baked.computeBoundingBox();
  const box = baked.boundingBox!.clone();
  baked.dispose();
  return { dex, template, material, clips: parseAnimations(anim), box };
}

export function loadSpecies(dex: number): Promise<SpeciesAssets> {
  let p = cache.get(dex);
  if (!p) {
    p = load(dex);
    p.catch(() => cache.delete(dex));
    cache.set(dex, p);
  }
  return p;
}

/**
 * Pokémon animado escalado a una altura en metros: `object` tiene los pies en y=0 y está centrado en x/z.
 * `width`/`depth` son las medidas resultantes en metros.
 */
export class AnimatedPokemon {
  readonly object = new THREE.Group();
  readonly width: number;
  readonly depth: number;
  private rig: BuiltRig;
  private pose = new Pose();
  private time = Math.random() * 10;
  private blinkIn = 2 + Math.random() * 3;
  private blinkT = -1;
  private idle?: Clip;
  private blink?: Clip;
  private once?: { clip: Clip; t: number };

  constructor(private a: SpeciesAssets, readonly height: number) {
    this.rig = instantiateRig(a.template, a.material);
    const size = a.box.getSize(new THREE.Vector3());
    const s = height / Math.max(1e-3, size.y);
    const inner = this.rig.root;
    inner.scale.setScalar(s);
    // El giro de 180° manda el centro de la caja a (-c.x, -c.z): se compensa para centrarlo en el origen.
    const c = a.box.getCenter(new THREE.Vector3());
    inner.position.set(c.x * s, -a.box.min.y * s, c.z * s);
    inner.rotation.y = Math.PI;
    this.object.add(inner);
    this.width = size.x * s;
    this.depth = size.z * s;
    const clips = a.clips;
    this.idle = clips.get('ground_idle') ?? clips.get('idle') ?? clips.get('battle_idle') ?? clips.get('air_idle') ?? clips.get('water_idle');
    this.blink = clips.get('blink');
  }

  /** Reproduce una vez una animación de Cobblemon (p. ej. "cry") encima del reposo, si existe. */
  playOnce(name: string) {
    const clip = this.a.clips.get(name);
    if (clip && Number.isFinite(clip.length)) this.once = { clip, t: 0 };
  }

  update(dt: number) {
    this.time += dt;
    const p = this.pose;
    p.clear();
    if (this.idle) p.addClip(this.idle, this.time, 1);
    if (this.blink) {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0 && this.blinkT < 0) { this.blinkT = 0; this.blinkIn = 2.5 + Math.random() * 3; }
      if (this.blinkT >= 0) {
        p.addClip(this.blink, this.blinkT, 1);
        this.blinkT += dt;
        if (this.blinkT > this.blink.length) this.blinkT = -1;
      }
    }
    if (this.once) {
      p.addClip(this.once.clip, this.once.t, 1);
      this.once.t += dt;
      if (this.once.t > this.once.clip.length) this.once = undefined;
    }
    applyPose(this.rig, p);
  }

  dispose() {
    this.object.removeFromParent();
  }
}
