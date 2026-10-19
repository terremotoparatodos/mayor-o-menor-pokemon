// Convierte un modelo Bedrock (.geo.json de Cobblemon) en una jerarquía de huesos de three.js.
// Convención (la misma que usa Blockbench): x invertida, rotaciones x/y invertidas, orden ZYX,
// unidades en píxeles (16 = un bloque). El frente del modelo mira hacia -Z.
import * as THREE from 'three';

export interface GeoCube {
  origin: [number, number, number];
  size: [number, number, number];
  uv?: [number, number] | Record<string, { uv: [number, number]; uv_size?: [number, number] }>;
  inflate?: number;
  mirror?: boolean;
  pivot?: [number, number, number];
  rotation?: [number, number, number];
}

export interface GeoBone {
  name: string;
  parent?: string;
  pivot?: [number, number, number];
  rotation?: [number, number, number];
  mirror?: boolean;
  cubes?: GeoCube[];
}

export interface GeoFile {
  'minecraft:geometry': Array<{
    description: { texture_width: number; texture_height: number };
    bones: GeoBone[];
  }>;
}

export interface BoneRest {
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

export interface BuiltRig {
  root: THREE.Group;
  bones: Map<string, THREE.Object3D>;
  rest: Map<string, BoneRest>;
}

const DEG = Math.PI / 180;
type V3 = [number, number, number];
type Rect = [number, number, number, number];
type FaceName = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

/** Rectángulos UV (en píxeles) de cada cara para UV tipo caja, igual que Blockbench. */
function boxUv(uv: [number, number], size: V3, mirror: boolean): Record<FaceName, Rect> {
  const [w, h, d] = size.map((s) => Math.floor(s + 1e-4)) as V3;
  const [u, v] = uv;
  const r = (x: number, y: number, sw: number, sh: number): Rect => [u + x, v + y, u + x + sw, v + y + sh];
  const faces: Record<FaceName, Rect> = {
    east: r(0, d, d, h),
    north: r(d, d, w, h),
    west: r(d + w, d, d, h),
    south: r(2 * d + w, d, w, h),
    up: r(d + w, d, -w, -d),
    down: r(d + 2 * w, 0, -w, d),
  };
  if (mirror) {
    const flip = (q: Rect): Rect => [q[2], q[1], q[0], q[3]];
    const east = faces.east;
    faces.east = flip(faces.west);
    faces.west = flip(east);
    faces.north = flip(faces.north);
    faces.south = flip(faces.south);
    faces.up = flip(faces.up);
    faces.down = flip(faces.down);
  }
  return faces;
}

function faceUv(cube: GeoCube, mirror: boolean): Partial<Record<FaceName, Rect>> {
  if (Array.isArray(cube.uv)) return boxUv(cube.uv, cube.size, mirror);
  const out: Partial<Record<FaceName, Rect>> = {};
  for (const [name, f] of Object.entries(cube.uv ?? {})) {
    const s = f.uv_size ?? [0, 0];
    out[name as FaceName] = [f.uv[0], f.uv[1], f.uv[0] + s[0], f.uv[1] + s[1]];
  }
  return out;
}

const toThree = (p: V3): THREE.Vector3 => new THREE.Vector3(-p[0], p[1], p[2]);
const toEuler = (r: V3 | undefined): THREE.Euler =>
  new THREE.Euler(-(r?.[0] ?? 0) * DEG, -(r?.[1] ?? 0) * DEG, (r?.[2] ?? 0) * DEG, 'ZYX');

class MeshBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  constructor(private tw: number, private th: number) {}

  addCube(cube: GeoCube, bonePivot: THREE.Vector3, boneMirror: boolean) {
    const inf = cube.inflate ?? 0;
    const [ox, oy, oz] = cube.origin;
    const [sx, sy, sz] = cube.size;
    const x0 = -(ox + sx) - inf, x1 = -ox + inf;
    const y0 = oy - inf, y1 = oy + sy + inf;
    const z0 = oz - inf, z1 = oz + sz + inf;
    const uvs = faceUv(cube, cube.mirror ?? boneMirror);
    const m = new THREE.Matrix4();
    if (cube.rotation) {
      const p = toThree(cube.pivot ?? [0, 0, 0]);
      m.makeTranslation(p.x, p.y, p.z)
        .multiply(new THREE.Matrix4().makeRotationFromEuler(toEuler(cube.rotation)))
        .multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
    }
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    // Cada cara: esquinas vistas desde afuera (arriba-izq, arriba-der, abajo-izq, abajo-der).
    const faces: Array<[FaceName, V3[], V3]> = [
      ['south', [[x0, y1, z1], [x1, y1, z1], [x0, y0, z1], [x1, y0, z1]], [0, 0, 1]],
      ['north', [[x1, y1, z0], [x0, y1, z0], [x1, y0, z0], [x0, y0, z0]], [0, 0, -1]],
      ['east', [[x1, y1, z1], [x1, y1, z0], [x1, y0, z1], [x1, y0, z0]], [1, 0, 0]],
      ['west', [[x0, y1, z0], [x0, y1, z1], [x0, y0, z0], [x0, y0, z1]], [-1, 0, 0]],
      ['up', [[x0, y1, z0], [x1, y1, z0], [x0, y1, z1], [x1, y1, z1]], [0, 1, 0]],
      ['down', [[x0, y0, z1], [x1, y0, z1], [x0, y0, z0], [x1, y0, z0]], [0, -1, 0]],
    ];
    // Los nombres de cara siguen a Blockbench, que ya trabaja con la X invertida (east = +X de three).
    const v = new THREE.Vector3();
    for (const [name, corners, n] of faces) {
      const rect = uvs[name];
      if (!rect || (rect[0] === rect[2] && rect[1] === rect[3])) continue;
      const base = this.pos.length / 3;
      const nv = new THREE.Vector3(...n).applyMatrix3(nm).normalize();
      const uvCorners: Array<[number, number]> = [
        [rect[0], rect[1]], [rect[2], rect[1]], [rect[0], rect[3]], [rect[2], rect[3]],
      ];
      corners.forEach((c, k) => {
        v.set(c[0], c[1], c[2]).applyMatrix4(m).sub(bonePivot);
        this.pos.push(v.x, v.y, v.z);
        this.nrm.push(nv.x, nv.y, nv.z);
        this.uv.push(uvCorners[k][0] / this.tw, 1 - uvCorners[k][1] / this.th);
      });
      this.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }

  build(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
}

/** Geometrías por hueso (compartibles entre instancias de la misma especie). */
export interface GeoTemplate {
  bones: GeoBone[];
  geometries: Map<string, THREE.BufferGeometry>;
}

export function buildTemplate(file: GeoFile): GeoTemplate {
  const geo = file['minecraft:geometry'][0];
  const { texture_width: tw, texture_height: th } = geo.description;
  const geometries = new Map<string, THREE.BufferGeometry>();
  for (const bone of geo.bones) {
    if (!bone.cubes?.length) continue;
    const mb = new MeshBuilder(tw, th);
    const pivot = toThree(bone.pivot ?? [0, 0, 0]);
    for (const cube of bone.cubes) mb.addCube(cube, pivot, bone.mirror ?? false);
    const g = mb.build();
    if (g) geometries.set(bone.name, g);
  }
  return { bones: geo.bones, geometries };
}

/** Instancia la jerarquía de huesos con un material compartido. */
export function instantiateRig(t: GeoTemplate, material: THREE.Material): BuiltRig {
  const root = new THREE.Group();
  const bones = new Map<string, THREE.Object3D>();
  const rest = new Map<string, BoneRest>();
  const pivots = new Map<string, THREE.Vector3>();
  for (const b of t.bones) pivots.set(b.name, toThree(b.pivot ?? [0, 0, 0]));
  for (const b of t.bones) {
    const g = new THREE.Group();
    g.name = b.name;
    const pivot = pivots.get(b.name)!;
    const parentPivot = b.parent ? pivots.get(b.parent) ?? new THREE.Vector3() : new THREE.Vector3();
    g.position.copy(pivot).sub(parentPivot);
    g.rotation.copy(toEuler(b.rotation));
    const geom = t.geometries.get(b.name);
    if (geom) {
      const mesh = new THREE.Mesh(geom, material);
      mesh.castShadow = true;
      g.add(mesh);
    }
    bones.set(b.name, g);
    rest.set(b.name, { position: g.position.clone(), rotation: g.rotation.clone() });
  }
  for (const b of t.bones) {
    const g = bones.get(b.name)!;
    const parent = b.parent ? bones.get(b.parent) : undefined;
    (parent ?? root).add(g);
  }
  return { root, bones, rest };
}

/** Fusiona todo el modelo en reposo en una sola geometría (para el público: una llamada de dibujo por Pokémon). */
export function bakeStatic(t: GeoTemplate): THREE.BufferGeometry {
  const rig = instantiateRig(t, new THREE.MeshBasicMaterial());
  rig.root.updateMatrixWorld(true);
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  const v = new THREE.Vector3();
  rig.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry as THREE.BufferGeometry;
    const nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), u = g.getAttribute('uv');
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      nrm.push(v.x, v.y, v.z);
      uv.push(u.getX(i), u.getY(i));
    }
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i));
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
