// Genera src/content/pokedex.json: especies jugables = retrato PMD + altura/peso
// verificados en DOS fuentes independientes (si no coinciden exactamente, la especie queda fuera).
//
//   Fuente A · PokéAPI (CSV del repo PokeAPI/pokeapi): height en dm, weight en hg, forma por defecto.
//   Fuente B · Pokémon Showdown (play.pokemonshowdown.com/data/pokedex.json): heightm, weightkg, forma base.
//
//   npm run data              → usa .cache/ si existe
//   npm run data -- --refresh → vuelve a descargar las fuentes
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.cache/data');
const refresh = process.argv.includes('--refresh');
mkdirSync(cache, { recursive: true });

const CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
const SOURCES = {
  'pokemon.csv': `${CSV}pokemon.csv`,
  'pokemon_species_names.csv': `${CSV}pokemon_species_names.csv`,
  'showdown-pokedex.json': 'https://play.pokemonshowdown.com/data/pokedex.json',
};

async function source(file) {
  const p = join(cache, file);
  if (!refresh && existsSync(p)) return readFileSync(p, 'utf8');
  console.log(`  descargando ${SOURCES[file]}`);
  const r = await fetch(SOURCES[file]);
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
  const text = await r.text();
  writeFileSync(p, text);
  return text;
}

function parseCsv(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const cols = head.split(',');
  return rows.map((line) => {
    // Los nombres pueden venir entre comillas con comas adentro.
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? '']));
  });
}

const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const portraits = new Set(readJson('public/portraits/manifest.json').dex);

const pokemon = parseCsv(await source('pokemon.csv'));
const names = parseCsv(await source('pokemon_species_names.csv'));
const showdown = JSON.parse(await source('showdown-pokedex.json'));

const nameOf = (dex, lang) => names.find((n) => Number(n.pokemon_species_id) === dex && n.local_language_id === String(lang))?.name;
const sdBase = new Map();
for (const e of Object.values(showdown)) if (e.num > 0 && !e.forme && !sdBase.has(e.num)) sdBase.set(e.num, e);

const out = [];
const excluded = [];
for (const dex of [...portraits].sort((x, y) => x - y)) {
  const a = pokemon.find((p) => Number(p.species_id) === dex && p.is_default === '1');
  const b = sdBase.get(dex);
  const slug = a?.identifier ?? `#${dex}`;
  const why = !a ? 'sin dato PokéAPI' : !b ? 'sin dato Showdown' : null;
  if (why) { excluded.push(`${slug}: ${why}`); continue; }
  const height = Number(a.height) / 10;
  const weight = Number(a.weight) / 10;
  if (Math.abs(height - b.heightm) > 1e-9 || Math.abs(weight - b.weightkg) > 1e-9) {
    excluded.push(`${slug}: fuentes distintas (A ${height} m ${weight} kg · B ${b.heightm} m ${b.weightkg} kg)`);
    continue;
  }
  out.push({ dex, slug, name: nameOf(dex, 7) ?? nameOf(dex, 9) ?? b.name, height, weight });
}
out.sort((x, y) => x.dex - y.dex);

mkdirSync(join(root, 'src/content'), { recursive: true });
writeFileSync(join(root, 'src/content/pokedex.json'), `${JSON.stringify(out, null, 0).replace(/},{/g, '},\n{')}\n`);
writeFileSync(join(cache, 'excluded.txt'), excluded.join('\n'));
console.log(`Listo: ${out.length} especies jugables · ${excluded.length} excluidas (ver .cache/data/excluded.txt)`);
