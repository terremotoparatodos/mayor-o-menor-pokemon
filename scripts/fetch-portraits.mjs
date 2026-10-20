// Retratos de Pokémon Mystery Dungeon (PMDCollab/SpriteCollab, CC BY-NC 4.0).
// Un clon parcial de git (sin historial, sólo portrait/<dex>/Normal.png + créditos) en .cache/ y copia a
// public/portraits/ junto con credits.json: quién hizo el retrato Normal actual de cada especie.
//
//   npm run portraits            → clona o actualiza .cache/SpriteCollab
//   npm run portraits -- --offline   → sólo copia desde el clon existente
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '.cache/SpriteCollab');
const outDir = join(root, 'public/portraits');
const offline = process.argv.includes('--offline');
const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'inherit' });
const SPARSE = ['/portrait/*/Normal.png', '/portrait/*/credits.txt', '/credit_names.txt', '/LICENSE*', '/README.md'];

if (!offline) {
  if (!existsSync(join(repo, '.git'))) {
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--no-checkout',
      'https://github.com/PMDCollab/SpriteCollab.git', repo], { stdio: 'inherit' });
    git('sparse-checkout', 'set', '--no-cone', ...SPARSE);
    git('checkout');
  } else {
    // Es una caché de sólo lectura: se lleva al último commit (pull falla con historial superficial).
    git('sparse-checkout', 'set', '--no-cone', ...SPARSE);
    git('fetch', '--depth', '1', 'origin', 'master');
    git('reset', '--hard', 'FETCH_HEAD');
  }
}

// credit_names.txt: Name \t Discord \t Contact (el autor en credits.txt es el campo Discord o el nombre).
const people = new Map();
const namesFile = join(repo, 'credit_names.txt');
if (existsSync(namesFile)) {
  for (const line of readFileSync(namesFile, 'utf8').split(/\r?\n/).slice(1)) {
    const [name, discord, contact] = line.split('\t');
    if (!name) continue;
    const person = { name: name.trim(), contact: /^https?:\/\//.test(contact ?? '') ? contact.trim() : undefined };
    people.set(discord?.trim(), person);
    people.set(name.trim(), person);
  }
}

/** Autores vigentes (CUR) del retrato Normal, en orden de aparición. */
function normalAuthors(creditsPath) {
  if (!existsSync(creditsPath)) return [];
  const out = [];
  for (const line of readFileSync(creditsPath, 'utf8').split(/\r?\n/)) {
    const [, author, status, , emotions] = line.split('\t');
    if (status !== 'CUR' || !emotions?.split(',').includes('Normal')) continue;
    const p = people.get(author) ?? { name: 'Autor sin nombre registrado' };
    if (!out.some((o) => o.name === p.name)) out.push(p);
  }
  return out;
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const found = [];
const credits = {};
for (let dex = 1; dex <= 1025; dex++) {
  const dir = join(repo, 'portrait', String(dex).padStart(4, '0'));
  const src = join(dir, 'Normal.png');
  if (!existsSync(src)) continue;
  copyFileSync(src, join(outDir, `${dex}.png`));
  found.push(dex);
  credits[dex] = normalAuthors(join(dir, 'credits.txt'));
}
const license = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].map((f) => join(repo, f)).find(existsSync);
if (license) writeFileSync(join(outDir, 'LICENSE.txt'), readFileSync(license));
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ source: 'PMDCollab/SpriteCollab', dex: found }));
writeFileSync(join(outDir, 'credits.json'), JSON.stringify(credits));
const missing = found.filter((d) => credits[d].length === 0).length;
console.log(`Listo: ${found.length} retratos en public/portraits/ · créditos para ${found.length - missing}`);
