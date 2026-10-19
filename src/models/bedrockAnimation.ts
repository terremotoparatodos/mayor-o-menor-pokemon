// Animaciones Bedrock (.animation.json de Cobblemon): parseo, muestreo y aplicación a un rig.
import type { BuiltRig } from './bedrockGeometry';
import { compileMolang, type MolangContext } from './molang';

type Vec = [number, number, number];
type Sampler = (t: number, ctx: MolangContext) => Vec;

interface Track {
  rotation?: Sampler;
  position?: Sampler;
  scale?: Sampler;
}

export interface Clip {
  name: string;
  loop: boolean;
  length: number;
  tracks: Map<string, Track>;
}

type RawVec = number | string | Array<number | string>;
type RawKey = RawVec | { pre?: RawVec; post?: RawVec; lerp_mode?: string };
type RawChannel = RawVec | Record<string, RawKey>;

function vecFn(raw: RawVec): (ctx: MolangContext) => Vec {
  if (!Array.isArray(raw)) {
    const f = compileMolang(raw);
    return (c) => { const v = f(c); return [v, v, v]; };
  }
  const [a, b, c] = [0, 1, 2].map((i) => compileMolang(raw[i] ?? 0));
  return (x) => [a(x), b(x), c(x)];
}

function isKeyframed(raw: RawChannel): raw is Record<string, RawKey> {
  return typeof raw === 'object' && !Array.isArray(raw);
}

function channel(raw: RawChannel): { sample: Sampler; maxTime: number } {
  if (!isKeyframed(raw)) {
    const f = vecFn(raw);
    return { sample: (_t, c) => f(c), maxTime: 0 };
  }
  const keys = Object.entries(raw)
    .map(([time, k]) => {
      const obj = typeof k === 'object' && !Array.isArray(k) ? k : { pre: k, post: k };
      const post = vecFn(obj.post ?? obj.pre ?? 0);
      const pre = vecFn(obj.pre ?? obj.post ?? 0);
      return { t: parseFloat(time), pre, post };
    })
    .sort((a, b) => a.t - b.t);
  const sample: Sampler = (t, c) => {
    if (t <= keys[0].t) return keys[0].pre(c);
    const last = keys[keys.length - 1];
    if (t >= last.t) return last.post(c);
    let i = 0;
    while (keys[i + 1].t < t) i++;
    const a = keys[i], b = keys[i + 1];
    const k = (t - a.t) / (b.t - a.t || 1);
    const va = a.post(c), vb = b.pre(c);
    return [va[0] + (vb[0] - va[0]) * k, va[1] + (vb[1] - va[1]) * k, va[2] + (vb[2] - va[2]) * k];
  };
  return { sample, maxTime: last(keys).t };
}

const last = <T,>(a: T[]) => a[a.length - 1];

interface RawAnimation {
  loop?: boolean | string;
  animation_length?: number;
  bones?: Record<string, { rotation?: RawChannel; position?: RawChannel; scale?: RawChannel }>;
}

/** Devuelve los clips indexados por nombre corto: "animation.machop.ground_walk" → "ground_walk". */
export function parseAnimations(json: { animations?: Record<string, RawAnimation> }): Map<string, Clip> {
  const out = new Map<string, Clip>();
  for (const [full, a] of Object.entries(json.animations ?? {})) {
    const name = full.split('.').slice(2).join('.') || full;
    const tracks = new Map<string, Track>();
    let maxTime = 0;
    for (const [bone, ch] of Object.entries(a.bones ?? {})) {
      const tr: Track = {};
      for (const kind of ['rotation', 'position', 'scale'] as const) {
        const raw = ch[kind];
        if (raw === undefined) continue;
        const c = channel(raw);
        tr[kind] = c.sample;
        maxTime = Math.max(maxTime, c.maxTime);
      }
      tracks.set(bone, tr);
    }
    const length = a.animation_length ?? (maxTime > 0 ? maxTime : Infinity);
    out.set(name, { name, loop: a.loop === true || a.loop === 'true', length, tracks });
  }
  return out;
}

/** Pose acumulada: offsets Bedrock (grados / píxeles) por hueso. */
export class Pose {
  rot = new Map<string, Vec>();
  pos = new Map<string, Vec>();
  scl = new Map<string, Vec>();

  clear() {
    this.rot.clear();
    this.pos.clear();
    this.scl.clear();
  }

  add(map: Map<string, Vec>, bone: string, v: Vec, w: number) {
    const cur = map.get(bone);
    if (cur) { cur[0] += v[0] * w; cur[1] += v[1] * w; cur[2] += v[2] * w; }
    else map.set(bone, [v[0] * w, v[1] * w, v[2] * w]);
  }

  addRotation(bone: string, x: number, y: number, z: number, w = 1) {
    this.add(this.rot, bone, [x, y, z], w);
  }

  addClip(clip: Clip, time: number, weight: number) {
    if (weight <= 0.001) return;
    const t = clip.loop && Number.isFinite(clip.length) && clip.length > 0 ? time % clip.length : time;
    const ctx = { animTime: t };
    for (const [bone, tr] of clip.tracks) {
      if (tr.rotation) this.add(this.rot, bone, tr.rotation(t, ctx), weight);
      if (tr.position) this.add(this.pos, bone, tr.position(t, ctx), weight);
      if (tr.scale) {
        const s = tr.scale(t, ctx);
        // La escala se mezcla como desvío respecto de 1.
        this.add(this.scl, bone, [s[0] - 1, s[1] - 1, s[2] - 1], weight);
      }
    }
  }
}

const DEG = Math.PI / 180;

/** Reinicia cada hueso a su reposo y le suma la pose. */
export function applyPose(rig: BuiltRig, pose: Pose) {
  for (const [name, bone] of rig.bones) {
    const rest = rig.rest.get(name)!;
    const r = pose.rot.get(name);
    const p = pose.pos.get(name);
    const s = pose.scl.get(name);
    bone.rotation.set(
      rest.rotation.x - (r ? r[0] * DEG : 0),
      rest.rotation.y - (r ? r[1] * DEG : 0),
      rest.rotation.z + (r ? r[2] * DEG : 0),
      'ZYX',
    );
    bone.position.set(rest.position.x - (p ? p[0] : 0), rest.position.y + (p ? p[1] : 0), rest.position.z + (p ? p[2] : 0));
    if (s) bone.scale.set(Math.max(0, 1 + s[0]), Math.max(0, 1 + s[1]), Math.max(0, 1 + s[2]));
    else bone.scale.set(1, 1, 1);
  }
}
