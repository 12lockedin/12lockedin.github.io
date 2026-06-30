# El scraper

Convierte las páginas públicas del sistema de horarios en los JSON que consume la
app. Vive en `scraper/` y usa solo `requests` + `beautifulsoup4`.

## Páginas de origen

| Página | Qué da | Parser |
| --- | --- | --- |
| `principal.page` | Índice de **grados** → enlaces `plan.page?plan&centro` | `parse_catalog_index(…, "grado")` |
| `<año>/postgrado.page` | Índice de **másteres** → enlaces `master.page?plan&centro` | `parse_catalog_index(…, "master")` |
| `<año>/master.page` | Asignaturas de un **máster** | `parse_programme` |
| `<año>/porCentroPlanAsignatura.tt?…&asignatura&valorPer` | Tabla horaria de una asignatura (todos sus grupos) | `parse_timetable` |
| `<año>/plan.page` | **Grado**: grupos de matrícula (curso+grupo) | `parse_matricula_groups` |
| `<año>/porCentroPlanCursoGrupo.tt?…&curso&grupo&valorPer` | Tabla horaria de un grupo de matrícula | `parse_timetable` |

**Másteres** (`_scrape_master`): página de plan → lista de asignaturas → una
página por asignatura (trae todos sus grupos). Modelo limpio.

**Grados** (`_scrape_grado`): la página de plan no lista asignaturas, así que se
recorren todos los horarios *curso+grupo* y se **agregan** sus celdas en el mismo
modelo asignatura→grupos. Captura datos, pero ver la limitación de abajo.

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

El markup es viejo y malformado. Problemas reales, ya cubiertos:

1. **Comentarios `--!>`** (cierre inválido). El parser estricto trata todo hasta
   el siguiente `-->` como comentario y se come tablas enteras. Normalizado en
   `_soup()` (`--!>` → `-->`).
2. **`&` sin escapar.** `&centro=` se interpreta como entidad `&cent` → `¢`. Se
   repara en `_unmangle_href()` antes de leer parámetros.
3. **`colspan` en cabeceras de día.** Un día con grupos en paralelo ocupa varias
   columnas; ignorarlo desplaza todos los días posteriores (síntoma típico:
   clases de viernes que “aparecen” en sábado).
4. **Encoding.** El `Content-Type` dice latin-1 pero el contenido es utf-8: se
   fuerza utf-8 en `fetch()` para evitar mojibake (`AdministraciÃ³n`).

## Planes sin publicar y planes vacíos

En junio la mayoría de horarios 2026/2027 aún no están publicados (“… aún no
están disponibles”). `_finish_plan` **omite** cualquier plan con 0 sesiones, así
que `data/plans/` solo contiene planes con horario real. La cobertura crece sola.

## Limitación de grados (no conectado a la app)

El scraper de grados funciona, pero el modelo de matrícula tiene **desdoble
magistral + reducido**: cada asignatura aparece con muchos grupos mezclados
(teoría `31/32/38…` + reducidos `10xx`) y el alumno elige *uno de cada*, no uno
solo. La UI actual (un grupo por asignatura) no lo refleja, así que **no se
versiona data de grado**. Pendiente: UX de dos niveles (teoría + reducido).

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
