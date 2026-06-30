# Cuaderno de Campo · Planificador de horarios

Una herramienta para **planificar tu horario antes de matricularte**. Eliges tu
titulación, marcas las asignaturas que vas a cursar y compones tu semana
**cambiando el grupo de cada asignatura** hasta que encaje sin solapes.

La interfaz está pensada como un *cuaderno de campo* de naturalista: papel cálido,
tinta, anotaciones a mano y pigmentos terrosos.

> Es una utilidad **no oficial y orientativa**. Los datos se extraen de las
> publicaciones de horarios de la universidad y pueden cambiar: **verifica
> siempre en la fuente oficial antes de matricularte.**

---

## Cómo funciona, de un vistazo

1. **Titulación.** Busca tu grado o máster en el catálogo.
2. **Asignaturas.** Marca las que vas a matricular (agrupadas por cuatrimestre).
3. **Horario.** Aparece tu semana con todas las asignaturas en el **grupo 1**.
   Pincha cualquier bloque: se resalta esa asignatura y aparecen los **grupos
   alternativos** a los que puedes cambiarla. Al elegir uno, solo cambia esa
   asignatura. La herramienta marca en rojo los **solapes**.

Todo ocurre en el navegador. Tus selecciones se guardan únicamente en tu equipo
(`localStorage`); no hay servidor ni cuentas.

## Stack

HTML + CSS + JavaScript “a pelo” (sin framework ni build). Los horarios viven en
ficheros **JSON estáticos** que genera un **scraper en Python**. El navegador no
puede pedir los datos en vivo a la web de la universidad (lo impide CORS), así
que el patrón es: *scrapear fuera de línea → versionar el JSON → servirlo
estático*. Un **GitHub Action** lo mantiene fresco.

```
┌─ scraper (Python) ─┐      ┌─ data/*.json ─┐      ┌─ app (HTML/CSS/JS) ─┐
│ páginas oficiales  │ ───▶ │ catálogo +    │ ───▶ │ catálogo → asignat. │
│ → JSON             │      │ planes        │      │ → constructor       │
└────────────────────┘      └───────────────┘      └─────────────────────┘
        ▲ GitHub Action (semanal / manual)
```

## Arrancar en local

Necesitas **Python 3.11+**. El sitio debe servirse por HTTP (abrir el archivo con
doble clic *no* funciona: `fetch` y los módulos ES lo bloquean).

```bash
# desde la raíz del proyecto
python -m http.server 8000
# abre http://localhost:8000
```

## Datos: generarlos y ampliarlos

El catálogo (200+ titulaciones) viene incluido, junto con los horarios de los
**másteres ya publicados**. El resto muestran *“sin datos aún”*: muchos planes
2026/2027 aún están **en construcción** y se irán añadiendo según se publiquen.

```bash
cd scraper
pip install -r requirements.txt

python scrape.py catalog                 # solo el índice de titulaciones
python scrape.py plan 170 28 --kind master   # un plan concreto (plan, centro)
python scrape.py refresh                 # catálogo + re-scrapea lo ya presente
python scrape.py all --only master       # todos los másteres publicados
```

Los códigos `plan` y `centro` salen de la URL de cada titulación en el catálogo
(`data/catalog.json`). El scraper es **deliberadamente lento** (pausa entre
peticiones) para no saturar la fuente, y **omite los planes sin horario
publicado**.

> **Grados:** el scraper sabe leerlos (`--kind grado`), pero su modelo de
> matrícula (teoría + reducido) aún no encaja en la interfaz; por eso de momento
> solo se publican datos de **másteres**. Ver [`docs/SCRAPER.md`](docs/SCRAPER.md).

El host de origen es configurable por variable de entorno (`HORARIOS_HOST`,
`HORARIOS_YEAR`, `HORARIOS_DELAY`).

## Publicar

Al ser estático, sirve cualquier hosting de ficheros. Con **GitHub Pages**:
activa Pages sobre la rama principal, carpeta raíz. `index.html` está en la raíz.

## Estructura

```
index.html            · shell de la app
css/                  · sistema de diseño (tokens, base, componentes)
js/                   · lógica (data, store, grid, vistas)
data/                 · JSON generado (catálogo + planes)  ← lo escribe el scraper
scraper/              · harvester en Python + parsers
docs/                 · modelo de datos, scraper y sistema de diseño
.github/workflows/    · actualización automática de datos
```

Más detalle en [`docs/`](docs/) y en [`CLAUDE.md`](CLAUDE.md).

## Privacidad y aviso legal

- No se recoge ningún dato personal; no hay analítica ni backend.
- Los horarios son propiedad de su fuente original y se usan con fines
  orientativos y de ayuda al estudiante.
- Documentación y código se publican de forma anónima bajo licencia
  [MIT](LICENSE).
