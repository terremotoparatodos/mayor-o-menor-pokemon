// Texturas dibujadas en canvas: piso, sombra y pared de medición (estilo rueda de reconocimiento).
import * as THREE from 'three';
import { formatValue } from '../game/format';

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function blobShadowTexture() {
  return canvasTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    r.addColorStop(0, 'rgba(0,0,0,.55)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
}

export function floorTexture() {
  return canvasTexture(512, 512, (g) => {
    const r = g.createRadialGradient(256, 256, 20, 256, 256, 255);
    r.addColorStop(0, 'rgba(22,22,31,.78)');
    r.addColorStop(0.7, 'rgba(22,22,31,.55)');
    r.addColorStop(1, 'rgba(22,22,31,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 512, 512);
  });
}

/** Paso "lindo" para las líneas de la pared: 0,1 · 0,2 · 0,5 · 1 · 2 · 5 · 10 m… */
export function niceStep(span: number, targetLines = 6) {
  const raw = span / targetLines;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

/**
 * Pared de medición de `width` × `height` metros con una línea cada `step` metros.
 * Las etiquetas van en los dos bordes para que se lean al recortar.
 */
export function measureWallTexture(width: number, height: number, step: number) {
  const px = 1024;
  const w = px;
  const h = Math.max(64, Math.round((px * height) / width));
  const scale = h / height;
  const fontPx = Math.max(16, Math.min(34, Math.round(w / 28)));
  return canvasTexture(w, h, (g) => {
    g.fillStyle = 'rgba(16,20,32,.72)';
    g.fillRect(0, 0, w, h);
    for (let i = 1; i * step < height; i++) {
      const v = i * step;
      const y = h - v * scale;
      const major = Math.abs(v / (step * 2) - Math.round(v / (step * 2))) < 1e-6;
      g.strokeStyle = major ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.25)';
      g.lineWidth = major ? 3 : 2;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      const label = formatValue(v, 'height').replace(',0 ', ' ');
      g.font = `${fontPx}px Bungee, sans-serif`;
      g.fillStyle = major ? 'rgba(255,216,74,.95)' : 'rgba(255,255,255,.6)';
      g.textBaseline = 'bottom';
      g.textAlign = 'left';
      g.fillText(label, 10, y - 4);
      g.textAlign = 'right';
      g.fillText(label, w - 10, y - 4);
    }
    // Línea del piso.
    g.fillStyle = 'rgba(255,255,255,.7)';
    g.fillRect(0, h - 4, w, 4);
  });
}
