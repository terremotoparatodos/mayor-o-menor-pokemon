# ¿Mayor o Menor? Pokémon

Higher or lower de **altura** y **peso** para grabar en persona, con el ADN visual de PokeDuelo /
Buscaminas / Letras (Bungee, contornos de tinta, fondo, paneles y panel de control) y el cargador de
modelos de Cobblemon de ¡Millón al Agua!.

1. **Pregunta:** "¿QUIÉN ES MÁS ALTO?" o "¿QUIÉN ES MÁS PESADO?" con dos cartas con el **retrato de
   Mystery Dungeon** (PMDCollab/SpriteCollab). Los retratos son todos del mismo tamaño y ningún valor
   está a la vista, así que no hay forma de medir a ojo. Se elige uno de los dos.
2. **Revelación:** los dos **modelos 3D de Cobblemon** aparecen del mismo tamaño y se transforman a su
   escala real (altura de la Pokédex).
   - Altura: pared de medición con metros y una sola medición que sube para los dos a la misma
     velocidad: el más bajo se frena primero y una línea marca su altura.
   - Peso: balancín que se inclina hacia el más pesado mientras se cuentan los kg de los dos.
3. **Resultado:** el cartel reemplaza a la pregunta y suma 1 al jugador del turno. Cada ronda es una
   pareja nueva (ninguno ya medido antes) y la categoría se alterna.

## Cuadro para edición

El reel es 1920×1080 con el **cuadro de juego 1080×1080 centrado**: todo lo que importa está adentro
(marcadores, pregunta, cartas, animación, resultado). Los costados son relleno y se recortan.
`?cuadro=1` deja el reel en 1080×1080 exacto. `R` = grabación 1:1 (sin escalar a la ventana).

## Preparar y abrir

```bash
npm install
npm run setup   # models (jar de Cobblemon) + portraits (SpriteCollab) + data (PokéAPI × Showdown)
npm run dev     # http://localhost:5330/
```

- `npm run models` busca el jar de Cobblemon en tus instancias de CurseForge (o pasalo como argumento) y
  extrae el modelo base de cada especie a `public/cobblemon/` (gitignored, licencia propia por modelo).
- `npm run portraits` hace un clon parcial (sin historial, sólo `portrait/*/Normal.png`) de SpriteCollab en
  `.cache/` y copia los retratos a `public/portraits/` (gitignored, CC BY-NC 4.0).
- `npm run data` cruza altura y peso de **PokéAPI** y **Pokémon Showdown**; si no coinciden exactamente la
  especie queda afuera. Resultado: `src/content/pokedex.json` (838 especies hoy; Maushold queda afuera).

URL: `?seed=texto` partida reproducible · `?jugadores=SKY,GUTI` (uno solo = modo racha) ·
`?cuadro=1` · `?nopanel=1` · `?clean=1` sin guías.

## Teclas

| Tecla | Acción |
|---|---|
| `←` / `1` · `→` / `2` | Elegir el de la izquierda / derecha (o clic en la carta o el botón) |
| `Enter` / `Espacio` | Saltar la animación · continuar · nueva partida al final |
| `N` | Otra pareja (antes de responder) |
| `C` | Cambiar altura ↔ peso (elige otra pareja) |
| `A` | Repetir la animación (para otra toma) |
| `U` / `Retroceso` | Deshacer |
| `J` · `+` / `−` | Cambiar turno · punto al jugador del turno |
| `M` · `G` · `P` · `R` | Mute · guías · panel · grabación 1:1 |

El panel (fuera del reel) tiene la respuesta plegada, nombres y puntos, modo (2 jugadores o racha),
categoría, cantidad de rondas y la diferencia mínima/máxima entre valores (por defecto ×1,15 a ×8:
nunca hay empate ni comparaciones obvias).

## Estructura

```
src/game/     dominio sin DOM: rondas, sesión (turnos, cadena, deshacer), formato · tests
src/render/   compareScene (línea de tiempo pura de t) · labels (carteles HTML) · textures
src/models/   Bedrock → three.js (de ¡Millón al Agua!) · pokemonModel (escala a metros)
src/ui/       squareView (cuadro) · panel · styles.css
src/app/      controller (sesión ↔ vista ↔ escena ↔ sonido) · src/input/keys.ts
scripts/      extract-cobblemon · fetch-portraits · build-data
```
