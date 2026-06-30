# Sistema de diseño · “Cuaderno de Campo”

Un sistema **naturalista**: la pantalla se lee como un cuaderno de campo de
naturalista —papel cálido, tinta, anotaciones a mano y pigmentos terrosos— sobre
una paleta de **tonos cálidos institucionales** (ocre/teja + un azul marino frío
de contrapunto). Sin mencionar ninguna marca.

Todo se define con variables CSS en [`css/tokens.css`](../css/tokens.css).

## Principios

- **Materialidad de papel.** Fondo crema con luz radial cálida, fibra tenue y un
  **grano** de ruido (SVG `feTurbulence`) en `multiply` por encima de todo. Nada
  es plano: sombras suaves y marrones, no negras.
- **Tinta y pigmento.** Texto en negro cálido (`--ink`). Acentos como pigmentos
  prensados: ocre/teja primario (`--ochre`), ámbar, marino, verde salvia/musgo.
- **Dos voces tipográficas + una a mano.** Serif orgánica para titulares
  (*Fraunces*), sans humanista para interfaz (*Inter*), monoespaciada para datos
  y horas (*Spline Sans Mono*), y **manuscrita** (*Caveat*) para marginalia y
  micro-instrucciones (“cambiar a”, “consejo”).
- **Pigmentos botánicos** para las asignaturas: 12 tonos terrosos y apagados
  (`--pig-1…12`) asignados por orden, legibles con texto oscuro encima.

## Paleta (resumen)

| Token | Uso |
| --- | --- |
| `--paper`, `--paper-2/3`, `--paper-edge` | Fondo, paneles, reglas |
| `--ink`, `--ink-soft`, `--ink-faint` | Texto principal / secundario / leve |
| `--ochre`, `--ochre-deep`, `--amber` | Acción primaria, selección, resaltes |
| `--navy` | Enlaces y contrapunto frío |
| `--sage`, `--moss` | Acentos botánicos |
| `--brick` | Conflictos / solapes |
| `--pig-1…12` | Color por asignatura en el horario |

## Texturas y profundidad

- `.grain`: overlay fijo de ruido (no interactivo) a baja opacidad.
- `body`: gradientes radiales cálidos + tejido de fibra con `repeating-linear-gradient`.
- Sombras en tres niveles (`--shadow-sm/md/lg`) en marrón translúcido, más un
  brillo interior sutil (`--shadow-press`) para sensación de relieve.

## Componentes clave

- **Stepper** (1 Titulación · 2 Asignaturas · 3 Horario) con estados activo/hecho.
- **Tarjetas de titulación/asignatura** con badge de tipo y metadatos en mono.
- **Tablero semanal** (`css/app.css` → `.tt`): columna de horas + columnas de día
  con líneas horarias tenues; bloques posicionados en porcentaje.
  - `.block` coloreado por asignatura; `.block--conflict` con tramado en `--brick`.
  - `.ghost`: alternativa de grupo, en línea discontinua, con CTA manuscrito.
- **Panel lateral**: resumen (asignaturas / horas / solapes) y leyenda con
  selector de grupo por asignatura.

## Accesibilidad

- Respeta `prefers-reduced-motion` (desactiva transiciones).
- Foco visible (contorno ámbar) en campos.
- Contraste de texto sobre pigmentos pensado para texto oscuro.

## Extender

Cambia primero los **tokens**; los componentes heredan. Para reskins, basta
ajustar `css/tokens.css` sin tocar la lógica.
