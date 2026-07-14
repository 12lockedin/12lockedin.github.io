# CLAUDE.md

Guía de trabajo para este repositorio. La app se presenta como **planificador
de horarios para los grados y másteres de la UC3M** (con una pantalla inicial
de selección de universidad que anticipa más universidades). Los textos siguen
siendo impersonales, pero nombrar a la UC3M en la UI es correcto.

## Qué es

Planificador de horarios de matrícula, 100% cliente (HTML/CSS/JS sin build). Los
datos son **JSON estáticos** generados por un **scraper en Python**. Concepto
visual: *cuaderno de campo* naturalista con tonos cálidos institucionales.

## Arranque

```bash
python -m http.server 8000      # servir la app (fetch + ES modules exigen HTTP)
```
No abrir `index.html` con `file://`: la app lo detecta y avisa.

## Mapa del código

| Ruta | Rol |
| --- | --- |
| `index.html` | Shell con las 3 vistas (catálogo, asignaturas, horario) |
| `css/tokens.css` | Variables del sistema de diseño (paleta, tipografía, sombras) |
| `css/base.css` | Reset, textura de papel (grano SVG), componentes base |
| `css/app.css` | Masthead, stepper, catálogo, asignaturas, grid del horario |
| `js/main.js` | Punto de entrada (solo importa `app.js`) |
| `js/app.js` | Controlador: routing de vistas + render de las 3 pantallas |
| `js/grid.js` | Dibuja el tablero semanal desde un *view-model* |
| `js/store.js` | Estado en memoria + persistencia por plan en `localStorage` |
| `js/data.js` | `fetch` de `catalog.json`, `plans/<plan>-<centro>.json`, `index.json` |
| `js/util.js` | Helpers de DOM, tiempo, colores, normalización, toast |
| `scraper/parse.py` | Parsers de HTML → dicts (la parte delicada) |
| `scraper/scrape.py` | Descarga + orquestación + escritura de JSON |
| `data/` | Salida del scraper (versionada) |

## Modelo de datos

`data/catalog.json` → `{ year, programmes: [{ type:'grado'|'master', plan, centro, name, campus }] }`

`data/plans/<plan>-<centro>.json`:
```jsonc
{ "plan":170, "centro":28, "type":"master", "name":"…",
  "subjects":[
    { "code":"14283", "name":"…", "course":2, "term":1,
      "groups":[                         // ← la unidad de cambio en la UI
        // En grados cada grupo lleva además "kind": "magistral"|"reducido"
        // y opcionalmente "english": true (grupo en inglés).
        { "id":"1", "sessions":[
          { "day":4, "start":"09:00", "end":"10:30", "room":"Aula …",
            "type":"Máster oficial", "slots":[{ "dates":"11.sep-02.oct", "room":"…" }] }
        ]}
      ]}
  ]}
```
`day`: 0=Lunes … 5=Sábado. Detalle en [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md).

## La interacción central (no romper)

En la vista de horario, cada asignatura se pinta en sus **grupos seleccionados**
(uno por dimensión: magistral y, en grados, también reducido). Al pinchar un
bloque, `store.active` = código de esa asignatura y `store.activeDim` = su
dimensión: sus bloques se resaltan, el resto se atenúan, y se dibujan los
**ghosts** (las sesiones de los demás grupos de *esa* asignatura *en esa
dimensión*). Pinchar un ghost cambia `selection[code].groupId` (o `.reducedId`)
y re-renderiza. El cambio es **por asignatura y dimensión**: nunca toca las
demás. Los solapes se detectan por pares —entre asignaturas y entre el
magistral y el reducido de la misma— y se marcan en rojo. Inspirado en el
flujo de `00-INSPO/` (UX, no el diseño).

## Scraper: gotchas del HTML de origen (importantes)

El HTML es antiguo y algo malformado. Tres trampas ya resueltas en `parse.py`
—mantenerlas:

1. **Comentarios mal cerrados** `--!>` en vez de `-->`. El parser estricto se
   tragaba tablas enteras. Se normaliza en `_soup()`.
2. **`&` sin escapar en URLs.** `&centro=` se decodifica como la entidad `¢`
   (`&cent`), rompiendo `…&centro=…`. Se repara en `_unmangle_href()`.
3. **Cabeceras de día con `colspan>1`.** Un día con grupos en paralelo ocupa
   varias columnas. **No** asumir 1 columna = 1 día: el mapa columna→día se
   construye desde la fila de cabecera (`_build_col_to_day`) y el cuerpo respeta
   `rowspan` y `colspan`. Saltarse esto provoca días desplazados (p. ej. una
   clase de viernes apareciendo en sábado).
4. **Encoding.** Las páginas declaran `utf-8` en el meta pero mandan un
   `Content-Type` latin-1 engañoso. Se **fuerza utf-8** en `fetch()` (si no,
   "Administración" → "AdministraciÃ³n"). `chardet` aquí acierta poco.
5. **Horarios “en construcción”.** En junio la mayoría de planes 2026/2027 aún
   no están publicados (la página dice “… aún no están disponibles”). El scraper
   **omite** los planes sin ninguna sesión (`_finish_plan`): no se versiona un
   plan vacío. El `refresh` semanal sondea los másteres aún sin datos, así que
   la cobertura crece sola según se vayan publicando.

Comprobación rápida tras tocar el parser: re-scrapea el plan de ejemplo y
verifica que no aparezcan sesiones espurias en sábado (`day==5`) ni grupos vacíos.

```bash
cd scraper && python scrape.py plan 170 28 --kind master
```

## Comandos del scraper

```bash
python scrape.py catalog                    # índice de titulaciones
python scrape.py plan <plan> <centro> --kind grado|master
python scrape.py refresh                    # catálogo + re-scrapea lo presente + sondea las
                                            #   titulaciones aún sin datos (lo usa el Action)
python scrape.py all [--only grado|master] [--limit N]
```

## Grados: modelo de dos niveles (importante)

En **másteres**, una asignatura tiene grupos alternativos y se elige **uno**.
En **grados** hay desdoble **magistral + reducido**: el alumno asiste a *un*
grupo magistral **y** *un* grupo reducido de cada asignatura. Cómo está resuelto:

- **Scraping.** La página de plan de grado no lista asignaturas: se organiza por
  *grupo de matrícula* (curso+grupo → `porCentroPlanCursoGrupo.tt`). El scraper
  (`_scrape_grado` + `parse_matricula_groups`) recorre esos horarios y
  reconstruye asignatura→grupos. Cada grupo lleva `kind`
  (`"magistral"`/`"reducido"`; heurística: id numérico ≥ 1000 → reducido, es la
  convención de la fuente) y `english: true` si su enlace lleva la bandera
  `en.GB.gif` visible.
- **UI.** `selection[code] = { groupId, reducedId }`; se pintan ambos grupos.
  Pinchar un bloque fija además la **dimensión** (`store.activeDim`): los ghosts
  ofrecen solo alternativas del mismo tipo. La leyenda muestra dos selectores
  (con opción «— sin reducido —»). Asignaturas con un solo tipo de grupo (y los
  másteres, sin campo `kind`) degradan al comportamiento clásico de un selector.
- **Qué reducido casa con qué magistral no es scrapeable** (la fuente no lo
  publica). No se codifica: el solape magistral↔reducido de la misma asignatura
  se marca en rojo, que en la práctica delata las parejas inviables.

## Otras limitaciones

- Solo se importan sesiones con rango horario explícito; exámenes/reservas
  puntuales sin hora se ignoran.
- Cobertura de datos = planes **publicados** y scrapeados (ver
  `data/plans/index.json`). Crece según se publiquen los horarios 2026/2027.

## Convenciones

- Sin dependencias de front. Módulos ES nativos.
- Scraper solo con `requests` + `beautifulsoup4` (stdlib para el resto).
- Textos de UI en español, impersonales. La UC3M se nombra explícitamente
  (marca y selector de universidad); otras universidades aparecen como
  «próximamente».
- Datos versionados en `data/`; el Action los refresca (semanal / manual).
