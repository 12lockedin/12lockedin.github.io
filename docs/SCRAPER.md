# El scraper

Convierte las páginas públicas del sistema de horarios en los JSON que consume la
app. Vive en `scraper/` y usa solo `requests` + `beautifulsoup4`.

## Páginas de origen

| Página | Qué da | Parser |
| --- | --- | --- |
| `principal.page` | Índice de **grados** → enlaces `plan.page?plan&centro` | `parse_catalog_index(…, "grado")` |
| `<año>/postgrado.page` | Índice de **másteres** → enlaces `master.page?plan&centro` | `parse_catalog_index(…, "master")` |
| `<año>/plan.page` · `<año>/master.page` | Asignaturas de un plan | `parse_programme` |
| `<año>/porCentroPlanAsignatura.tt?…&asignatura&valorPer` | Tabla horaria de una asignatura | `parse_timetable` |

`valorPer` es el cuatrimestre (1/2); `tipoPer=C`. El host, el año y la pausa
entre peticiones se configuran por entorno (`HORARIOS_HOST`, `HORARIOS_YEAR`,
`HORARIOS_DELAY`).

## Cómo se lee la tabla horaria

La tabla es una rejilla: columnas = días, filas = tramos de 15 min. Una sesión es
un `<td class="celdaConSesion">` con `rowspan` (duración) y, a veces, `colspan`.

1. Se localiza la **fila de cabecera** (`th.cabeceraDia`) y se construye un mapa
   **columna → día** respetando `colspan` (`_build_col_to_day`). El día se deduce
   por el **texto** de la cabecera (LUNES…SÁBADO), no por el orden.
2. Se recorren las filas del cuerpo con un algoritmo de ocupación que respeta
   `rowspan` *y* `colspan`: cada celda se coloca en la primera columna libre; las
   celdas con `rowspan` bloquean sus columnas en las filas siguientes.
3. De cada celda de sesión se extrae: código y nombre + grupo (`div.asignaturaGrupo`,
   regex `grp\.N`), rango horario (texto `HH:MM a HH:MM`), y fechas/aulas
   (`div.fechasSesion`). El tipo sale de la clase CSS de la celda.
4. `group_sessions` colapsa la lista plana por grupo.

## Trampas del HTML (resueltas)

El markup es viejo y malformado. Tres problemas reales, ya cubiertos:

1. **Comentarios `--!>`** (cierre inválido). El parser estricto trata todo hasta
   el siguiente `-->` como comentario y se come tablas enteras. Normalizado en
   `_soup()` (`--!>` → `-->`).
2. **`&` sin escapar.** `&centro=` se interpreta como entidad `&cent` → `¢`. Se
   repara en `_unmangle_href()` antes de leer parámetros.
3. **`colspan` en cabeceras de día.** Un día con grupos en paralelo ocupa varias
   columnas; ignorarlo desplaza todos los días posteriores (síntoma típico:
   clases de viernes que “aparecen” en sábado).

## Comandos

```bash
python scrape.py catalog
python scrape.py plan <plan> <centro> --kind grado|master
python scrape.py refresh          # catálogo + re-scrapea lo ya presente
python scrape.py all [--only grado|master] [--limit N]
```

## Verificación tras tocar el parser

```bash
python scrape.py plan 170 28 --kind master
```
Señales de que algo va mal: grupos vacíos (0 grupos), sesiones en `day==5`
(sábado) inesperadas, horas fuera de rango. El parser se puede ejercitar contra
HTML guardado importando `parse` directamente.
