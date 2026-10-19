# ¿Mayor o Menor? Pokémon

Higher or lower de **altura** y **peso** para grabar en persona, con el ADN visual de PokeDuelo /
Buscaminas / Letras (Bungee, contornos de tinta, fondo, paneles y panel de control). Todo se juega con
los recuadros de retrato de Mystery Dungeon, también la comparación a escala.

Partida única con un solo puntaje: al iniciar se elige **ALTURA** o **PESO** y esa categoría vale para
las 20 rondas. Al final se muestra el puntaje (por ejemplo 14/20) y el botón o Enter vuelven al inicio.

1. **Pregunta:** "¿QUIÉN ES MÁS ALTO?" o "¿QUIÉN ES MÁS PESADO?" con dos cartas con el **retrato de
   Mystery Dungeon** (PMDCollab/SpriteCollab). Los retratos son todos del mismo tamaño y ningún valor
   está a la vista, así que no hay forma de medir a ojo. Se elige uno de los dos.
2. **Revelación:** la carta elegida se resalta y los recuadros de retrato se despegan de las cartas y
   caen al escenario. Tiemblan un momento (suspenso) y **todo se define de golpe**. Los recuadros nunca
   cambian de tamaño, porque eso adelantaría la respuesta.
   - Altura: cada recuadro sale disparado sobre una columna proporcional a sus metros, contra una pared
     de medición; una línea marca la altura del más bajo.
   - Peso: los dos recuadros están sobre un balancín que golpea hacia el más pesado.
3. **Resultado:** el cartel reemplaza a la pregunta, destello verde o rojo en el borde y +1 en el
   puntaje. Abajo aparece el botón **SIGUIENTE** (en la última ronda, **VER PUNTAJE**; al final,
   **VOLVER AL INICIO**): se sigue desde el propio juego, sin el panel. La escena se va y se reparte la pareja siguiente (cada ronda es una pareja nueva).

## Cuadro para edición

El reel es 1920×1080 con el **cuadro de juego 1080×1080 centrado**: todo lo que importa está adentro
(marcadores, pregunta, cartas, animación, resultado). Los costados son relleno y se recortan.
`?cuadro=1` deja el reel en 1080×1080 exacto. `R` = grabación 1:1 (sin escalar a la ventana).

## Preparar y abrir

```bash
npm install
npm run setup   # portraits (SpriteCollab) + data (PokéAPI × Showdown)
npm run dev     # http://localhost:5330/
```

- `npm run portraits` hace un clon parcial (sin historial, sólo `portrait/*/Normal.png`) de SpriteCollab en
  `.cache/` y copia los retratos a `public/portraits/` (gitignored, CC BY-NC 4.0).
- `npm run data` cruza altura y peso de **PokéAPI** y **Pokémon Showdown**; si no coinciden exactamente la
  especie queda afuera. Resultado: `src/content/pokedex.json` (1021 especies hoy; Minior, Maushold, Dipplin y Okidogi quedan afuera).

URL: `?seed=texto` partida reproducible · `?modo=altura` / `?modo=peso` saltea el inicio · `?rondas=20` ·
`?cuadro=1` · `?nopanel=1` · `?clean=1` sin guías.

## Teclas

| Tecla | Acción |
|---|---|
| `←` / `1` · `→` / `2` | Inicio: ALTURA / PESO · juego: elegir el de la izquierda / derecha (o clic) |
| `Enter` / `Espacio` | Saltar la animación · continuar · al final, volver al inicio |
| `N` | Otra pareja (antes de responder) |
| `A` | Repetir la animación (para otra toma) |
| `U` / `Retroceso` | Deshacer |
| `+` / `−` | Ajustar el puntaje |
| `Esc` | Volver al inicio |
| `M` · `G` · `P` · `R` | Mute · guías · panel · grabación 1:1 |

El panel (fuera del reel) tiene la elección de modo, la respuesta plegada, el puntaje, la cantidad de rondas y la diferencia mínima/máxima entre valores (por defecto ×1,15 a ×8:
nunca hay empate ni comparaciones obvias).

## Estructura

```
src/game/     dominio sin DOM: rondas, sesión (puntaje único, rondas, deshacer), formato · tests
src/render/   comparison (recuadros PMD, línea de tiempo pura de t) · labels (carteles HTML)
src/ui/       squareView (cuadro) · panel · styles.css
src/app/      controller (sesión ↔ vista ↔ comparación ↔ sonido) · src/input/keys.ts
scripts/      fetch-portraits · build-data
```
