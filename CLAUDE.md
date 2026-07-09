# CLAUDE.md

Guía de trabajo para este repositorio. Mantener **impersonal y anónima**; no
nombrar a ninguna universidad concreta en la app ni en los textos de cara al
usuario (el host de origen vive solo en la config del scraper).

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
        { "id":"1", "sessions":[
          { "day":4, "start":"09:00", "end":"10:30", "room":"Aula …",
            "type":"Máster oficial", "slots":[{ "dates":"11.sep-02.oct", "room":"…" }] }
        ]}
      ]}
  ]}
```
`day`: 0=Lunes … 5=Sábado. Detalle en [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md).

## La interacción central (no romper)

En la vista de horario, cada asignatura se pinta en su **grupo seleccionado**
(por defecto el `1`). Al pinchar un bloque, `store.active` = código de esa
asignatura: sus bloques se resaltan, el resto se atenúan, y se dibujan los
**ghosts** (las sesiones de los demás grupos de *esa* asignatura). Pinchar un
ghost cambia `selection[code].groupId` y re-renderiza. El cambio es **por
asignatura**: nunca toca las demás. Los solapes se detectan por pares y se
marcan en rojo. Inspirado en el flujo de `00-INSPO/` (UX, no el diseño).

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
python scrape.py refresh                    # catálogo + re-scrapea lo presente + sondea másteres
                                            #   aún sin datos (lo usa el Action; los grados quedan fuera)
python scrape.py all [--only grado|master] [--limit N]
```

## Grados: capacidad presente, no conectada a la UI (importante)

El modelo de la app es **“una asignatura → varios grupos, cada grupo = sus
sesiones”** y encaja perfecto en **másteres** (cada `grp.N` es un grupo de
matrícula completo). Los **grados** funcionan distinto:

- La página de plan de grado **no lista asignaturas**: se organiza por *grupo de
  matrícula* (curso+grupo → `porCentroPlanCursoGrupo.tt`). El scraper de grados
  (`_scrape_grado` + `parse_matricula_groups`) recorre esos horarios y
  reconstruye el modelo asignatura→grupos. **Funciona y extrae datos.**
- **Pero** en grados hay desdoble **magistral (grupos 31/32/38…) + reducido
  (10xx)**: el alumno elige *un* grupo de teoría **y** *un* reducido, no uno
  solo. En la UI actual aparecerían como muchos grupos alternativos mezclados →
  confuso/incorrecto. Por eso **no se versiona data de grado todavía**: requiere
  una iteración de UX (elegir teoría + reducido) antes de conectarlo.

Datos enviados = **solo másteres** publicados. El código de grado se conserva
como base para esa futura iteración (`scrape.py plan <plan> <centro> --kind grado`).

## Otras limitaciones

- Solo se importan sesiones con rango horario explícito; exámenes/reservas
  puntuales sin hora se ignoran.
- Cobertura de datos = planes **publicados** y scrapeados (ver
  `data/plans/index.json`). Crece según se publiquen los horarios 2026/2027.

## Convenciones

- Sin dependencias de front. Módulos ES nativos.
- Scraper solo con `requests` + `beautifulsoup4` (stdlib para el resto).
- Textos de UI en español, impersonales. Nada de nombres propios ni de la
  universidad en la app.
- Datos versionados en `data/`; el Action los refresca (semanal / manual).
