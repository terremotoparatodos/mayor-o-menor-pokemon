import type { SessionConfig } from './game/session';

/** Valores por defecto de la partida (el panel los cambia en vivo). */
export const DEFAULT_CONFIG: SessionConfig = {
  totalRounds: 20,
  rules: {
    // Al menos 15 % de diferencia y como mucho ×8: ni empates ni ballena contra mosquito.
    minRatio: 1.15,
    maxRatio: 8,
    recentWindow: 40,
  },
};
