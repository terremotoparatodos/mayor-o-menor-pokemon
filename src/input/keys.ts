// Teclas de grabación (mismo criterio que Buscaminas/Letras). Ignoradas mientras se escribe en el panel.
import type { Controller } from '../app/controller';

export function bindKeys(app: Controller) {
  addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    const body = document.body;
    const k = e.key.toLowerCase();
    const handled = (() => {
      switch (k) {
        // En el inicio ← elige ALTURA y → elige PESO (mismo lado que los botones).
        case 'arrowleft': case '1': app.guess('a'); return true;
        case 'arrowright': case '2': app.guess('b'); return true;
        case 'enter': case ' ': app.next(); return true;
        case 'n': app.reroll(); return true;
        case 'a': app.replay(); return true;
        case 'u': case 'backspace': app.undo(); return true;
        case '+': case '=': app.adjustScore(1); return true;
        case '-': app.adjustScore(-1); return true;
        case 'escape': app.toMenu(); return true;
        case 'm': app.sfx.toggleMute(); return true;
        case 'r': body.classList.toggle('rec'); return true;
        case 'g': body.classList.toggle('clean'); return true;
        case 'p': body.classList.toggle('nopanel'); return true;
        default: return false;
      }
    })();
    if (handled) {
      e.preventDefault();
      // Que un botón con foco no reciba también el Enter/Espacio.
      if (t instanceof HTMLButtonElement) t.blur();
    }
  });
}
