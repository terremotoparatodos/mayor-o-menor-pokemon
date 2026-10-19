// Retratos de Pokémon Mystery Dungeon (PMDCollab/SpriteCollab, CC BY-NC 4.0).
// Un clon parcial de git (sin historial, sólo portrait/<dex>/Normal.png) en .cache/ y copia a public/portraits/.
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

if (!offline) {
  if (!existsSync(join(repo, '.git'))) {
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--no-checkout',
      'https://github.com/PMDCollab/SpriteCollab.git', repo], { stdio: 'inherit' });
    git('sparse-checkout', 'set', '--no-cone', '/portrait/*/Normal.png', '/credit_names.txt', '/LICENSE*', '/README.md');
    git('checkout');
  } else {
    git('pull', '--depth', '1');
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const found = [];
for (let dex = 1; dex <= 1025; dex++) {
  const src = join(repo, 'portrait', String(dex).padStart(4, '0'), 'Normal.png');
  if (!existsSync(src)) continue;
  copyFileSync(src, join(outDir, `${dex}.png`));
  found.push(dex);
}
const license = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].map((f) => join(repo, f)).find(existsSync);
if (license) writeFileSync(join(outDir, 'LICENSE.txt'), readFileSync(license));
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ source: 'PMDCollab/SpriteCollab', dex: found }));
console.log(`Listo: ${found.length} retratos en public/portraits/`);
