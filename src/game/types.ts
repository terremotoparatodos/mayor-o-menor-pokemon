export interface Species {
  dex: number;
  slug: string;
  /** Nombre en español (PokéAPI). */
  name: string;
  /** Metros (Pokédex oficial). */
  height: number;
  /** Kilogramos (Pokédex oficial). */
  weight: number;
}

export type Category = 'height' | 'weight';
/** A quién elige el jugador como el más alto / más pesado: "a" = izquierda, "b" = derecha. */
export type Guess = 'a' | 'b';

export interface Round {
  no: number;
  category: Category;
  /** Izquierda. Ningún valor está a la vista hasta la revelación. */
  a: Species;
  /** Derecha. */
  b: Species;
  /** Índice del jugador que responde. */
  player: number;
}

export type Phase = 'guess' | 'reveal' | 'result' | 'over';
