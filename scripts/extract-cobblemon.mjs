// Extrae de tu jar local de Cobblemon el modelo base de CADA especie (la variación sin aspectos del
// resolver "0_*"): modelo Bedrock (.geo.json), animaciones, textura y licencia del modelo.
//
//   npm run models                      → busca el jar en tus instancias de CurseForge
//   npm run models -- "C:/ruta/Cobblemon-fabric-1.7.1+1.21.1.jar"
//   COBBLEMON_JAR="C:/ruta/al.jar" npm run models
//
// Salida: public/cobblemon/<dex>/ + public/cobblemon/manifest.json (gitignored: licencia propia por modelo).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/cobblemon');

function findJar() {
  const explicit = process.argv[2] || process.env.COBBLEMON_JAR;
  if (explicit) return explicit;
  const instances = join(homedir(), 'curseforge/minecraft/Instances');
  if (!existsSync(instances)) return null;
  const jars = [];
  for (const inst of readdirSync(instances)) {
    const mods = join(instances, inst, 'mods');
    if (!existsSync(mods)) continue;
    for (const f of readdirSync(mods)) {
      if (/^Cobblemon-(fabric|neoforge|forge)-[\d.]+\+[\d.]+\.jar$/i.test(f)) {
        const p = join(mods, f);
        jars.push({ p, v: f.match(/-([\d.]+)\+/)[1], t: statSync(p).mtimeMs });
      }
    }
  }
  const ver = (s) => s.split('.').map((n) => n.padStart(4, '0')).join('.');
  jars.sort((a, b) => ver(b.v).localeCompare(ver(a.v)) || b.t - a.t);
  return jars[0]?.p ?? null;
}

/** Lector mínimo de ZIP (directorio central + deflate) para no depender de herramientas externas. */
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('No parece un jar/zip válido');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.set(name, { method, csize, local });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
      const data = buf.subarray(start, start + e.csize);
      if (e.method === 0) return Buffer.from(data);
      if (e.method === 8) return inflateRawSync(data);
      throw new Error(`Compresión no soportada en ${name}`);
    },
  };
}

const jarPath = findJar();
if (!jarPath || !existsSync(jarPath)) {
  console.error('No encontré el jar de Cobblemon. Pasalo como argumento: npm run models -- "C:/ruta/Cobblemon.jar"');
  process.exit(1);
}
console.log(`Jar: ${jarPath}`);
const zip = readZip(readFileSync(jarPath));
const base = 'assets/cobblemon/';
const resource = (id) => id.replace(/^cobblemon:/, '');

// Índices: archivo de modelo/animación por nombre (sólo el pack base, no los resourcepacks opcionales).
const modelByFile = new Map();
const animByFile = new Map();
for (const n of zip.names) {
  if (n.startsWith(`${base}bedrock/pokemon/models/`) && n.endsWith('.geo.json')) modelByFile.set(n.split('/').pop(), n);
  if (n.startsWith(`${base}bedrock/pokemon/animations/`) && n.endsWith('.animation.json')) animByFile.set(n.split('/').pop(), n);
}
const resolvers = zip.names.filter((n) => /^assets\/cobblemon\/bedrock\/pokemon\/resolvers\/\d+_[^/]+\/0_[^/]+\.json$/.test(n));

rmSync(outDir, { recursive: true, force: true });
const manifest = { source: jarPath.split(/[\\/]/).pop(), species: {} };
const skipped = [];

for (const r of resolvers) {
  const dex = Number(r.split('/').at(-2).split('_')[0]);
  let json;
  try { json = JSON.parse(zip.read(r).toString('utf8')); } catch { skipped.push(`${r} (json)`); continue; }
  if (json.order !== undefined && json.order !== 0) continue;
  const slug = resource(json.species ?? '');
  const v = (json.variations ?? []).find((x) => (x.aspects ?? []).length === 0);
  if (!dex || !slug || !v?.model || typeof v.texture !== 'string') { skipped.push(`${slug || r} (sin variación base)`); continue; }
  if (manifest.species[dex]) continue;
  const geoPath = modelByFile.get(`${resource(v.model)}.json`);
  const texPath = `${base}${resource(v.texture)}`;
  const geoBuf = geoPath && zip.read(geoPath);
  const texBuf = zip.read(texPath);
  if (!geoBuf || !texBuf) { skipped.push(`${slug} (falta modelo o textura)`); continue; }
  const poser = resource(v.poser ?? json.species);
  const animPath = animByFile.get(`${poser}.animation.json`) ?? animByFile.get(`${slug}.animation.json`);
  const animBuf = animPath && zip.read(animPath);
  const licBuf = zip.read(geoPath.replace(/[^/]+$/, 'license'));
  const dir = join(outDir, String(dex));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'model.geo.json'), geoBuf);
  writeFileSync(join(dir, 'texture.png'), texBuf);
  if (animBuf) writeFileSync(join(dir, 'anim.json'), animBuf);
  if (licBuf) writeFileSync(join(dir, 'LICENSE'), licBuf);
  manifest.species[dex] = { slug, animations: Boolean(animBuf) };
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
if (skipped.length) console.warn(`Salteados (${skipped.length}): ${skipped.join(', ')}`);
console.log(`Listo: ${Object.keys(manifest.species).length} especies en public/cobblemon/`);
