import './ui/styles.css';
import { Controller } from './app/controller';
import { DEFAULT_CONFIG } from './config';
import { bindKeys } from './input/keys';

const params = new URLSearchParams(location.search);
const body = document.body;
if (params.get('cuadro') === '1') body.classList.add('cuadro');
if (params.get('clean') === '1') body.classList.add('clean');
if (params.get('nopanel') === '1') body.classList.add('nopanel');

const rounds = Number(params.get('rondas'));
const config = { ...DEFAULT_CONFIG, totalRounds: Number.isFinite(rounds) && params.has('rondas') ? Math.max(0, Math.round(rounds)) : DEFAULT_CONFIG.totalRounds };
const app = new Controller(document.getElementById('square')!, document.getElementById('panel')!, params.get('seed'), config);
const mode = params.get('modo');
if (mode === 'altura' || mode === 'peso') app.chooseMode(mode === 'altura' ? 'height' : 'weight');
bindKeys(app);

// El reel se escala para entrar en la ventana; R = grabación 1:1 (sin escalar).
const reel = document.getElementById('reel')!;
function fit() {
  const w = reel.offsetWidth, h = reel.offsetHeight;
  const k = Math.min(window.innerWidth / w, window.innerHeight / h);
  reel.style.transform = `translate(-50%, -50%) scale(${k})`;
}
addEventListener('resize', fit);
new ResizeObserver(fit).observe(reel);
fit();

let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  app.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (import.meta.env.DEV) {
  // Para verificar con el panel del navegador oculto (sin requestAnimationFrame): __mom.advance(seg).
  (window as unknown as { __mom: unknown }).__mom = {
    app,
    advance(sec: number) { for (let t = 0; t < sec; t += 1 / 30) app.frame(1 / 30); },
  };
}
