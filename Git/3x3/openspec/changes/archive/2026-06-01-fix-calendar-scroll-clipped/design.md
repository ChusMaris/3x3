## Context

La tabla de horarios se renderiza con esta jerarquía de contenedores en `App.tsx`:

```
div.flex-1.overflow-hidden.flex.flex-col.min-h-0          ← padre, clip de overflow
  div.flex-1.min-h-0.overflow-auto.bg-slate-300/50        ← scroll container
    div.min-w-max.flex.flex-col                            ← grid interior
      div.sticky (header de columnas)
      [filas de horario…]                                  ← último slot queda cortado
```

El scroll container (`overflow-auto`) necesita que su contenido tenga espacio al final para que `scrollTop` pueda alcanzar el fondo. Sin padding inferior, el borde inferior del último elemento coincide exactamente con el límite del viewport del scroll, y dependiendo del navegador/sistema el último slot queda parcialmente oculto bajo la barra de scroll horizontal o el borde del contenedor padre.

## Goals / Non-Goals

**Goals:**
- El último slot horario debe ser completamente visible al llegar al final del scroll vertical.
- El fix no debe afectar la impresión ni el resto del layout.

**Non-Goals:**
- Rediseñar el sistema de scroll o el layout de la tabla.
- Cambiar el comportamiento en móvil (vista calendario).

## Decisions

### D1 — Añadir `pb-4` al contenedor interior `min-w-max`

**Decisión**: añadir `pb-4` (16 px) al `div.min-w-max.flex.flex-col` que contiene el header sticky y todas las filas. Esto crea espacio en la parte inferior del contenido scrollable sin alterar el layout de las filas.

**Alternativas descartadas**:
- _Añadir `pb-4` al scroll container_: en algunos navegadores el padding de un `overflow-auto` se aplica al viewport, no al contenido; no es fiable cross-browser.
- _Añadir una fila vacía al final_: introduce DOM innecesario.
- _Cambiar `overflow-hidden` del padre por `overflow-visible`_: rompe el layout flex y puede causar overflow visual fuera del área asignada.

**Rationale**: añadir padding al elemento de contenido (no al scroll container) es la forma canónica y cross-browser de garantizar espacio al final de un área scrollable.

### D2 — Neutralizar `pb-4` en impresión

**Decisión**: asegurar que el `pb-4` añadido no genere espacio en blanco extra al imprimir, añadiendo `pb-0` al selector correspondiente dentro del `@media print` existente en `index.css`.

## Risks / Trade-offs

- Riesgo mínimo: el cambio es puramente de espaciado y no afecta lógica ni datos.
- El padding de 16 px es suficiente para cubrir la altura de cualquier scrollbar nativa sin añadir espacio perceptible visualmente.

## Open Questions

- Ninguna.
