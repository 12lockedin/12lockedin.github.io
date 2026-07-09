# Modelo de datos

Todos los ficheros viven en `data/` y los genera el scraper. Codificación UTF-8.

## `catalog.json`

Índice de titulaciones para la primera pantalla.

```jsonc
{
  "year": "2026",
  "generatedAt": "2026-06-30T18:54:22Z",
  "count": 200,
  "programmes": [
    {
      "type": "grado",        // "grado" | "master"
      "plan": 580,             // identificador de plan de estudios
      "centro": 2,             // identificador de centro/campus
      "name": "Doble Grado en …",
      "campus": "Leganés"
    }
  ]
}
```

Una titulación puede aparecer varias veces si se imparte en varios campus (mismo
`plan`, distinto `centro`).

## `plans/<plan>-<centro>.json`

Horario completo de un plan. La clave de fichero es `<plan>-<centro>`.

```jsonc
{
  "plan": 170,
  "centro": 28,
  "type": "master",
  "name": "Máster Universitario en …",
  "year": "2026",
  "generatedAt": "…",
  "subjects": [
    {
      "code": "14283",
      "name": "Ampliación de Diseño y Ensayo de Máquinas",
      "course": 2,             // curso (puede ser null)
      "term": 1,               // cuatrimestre: 1 | 2 | null
      "groups": [
        {
          "id": "1",           // etiqueta de grupo (de "grp.N")
          "kind": "magistral", // solo grados: "magistral" | "reducido"
          "english": true,     // solo grados, opcional: grupo en inglés
          "sessions": [
            {
              "day": 4,        // 0=Lunes … 5=Sábado
              "start": "09:00",
              "end": "10:30",
              "room": "Aula 4.0.E04",
              "type": "Máster oficial",
              "slots": [        // tramos de fechas + aula (pueden ser varios)
                { "dates": "11.sep-02.oct", "room": "Aula 4.0.E04" },
                { "dates": "16.oct-11.dic", "room": "Aula 4.0.E04" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Notas

- **`groups` es la unidad de cambio** en la interfaz. Un grupo agrupa *todas* sus
  sesiones semanales; al cambiar de grupo se mueven todas juntas.
- **Grados**: cada grupo lleva `kind` (`"magistral"` o `"reducido"`; en la fuente
  los reducidos usan ids numéricos ≥ 1000). El alumno cursa un grupo de cada
  tipo, así que la interfaz permite elegir uno por dimensión y pinta la unión.
  `english: true` marca los grupos impartidos en inglés (bandera visible junto
  al enlace del grupo de matrícula). Los planes de máster no llevan `kind`.
- `room` en la sesión es el aula del primer tramo; `slots` conserva el detalle.
- Solo se incluyen sesiones con rango horario explícito.

## `plans/index.json`

Lista de planes ya descargados. La app la usa para marcar qué titulaciones
tienen datos (etiqueta “sin datos aún” en el resto).

```jsonc
{ "generatedAt": "…", "plans": ["170-28"] }
```
