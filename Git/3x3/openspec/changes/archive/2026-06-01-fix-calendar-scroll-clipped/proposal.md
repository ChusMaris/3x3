## Why

En la vista de calendario/pistas de la versión web, al hacer scroll hacia abajo en la tabla de partidos el último slot horario queda parcialmente oculto: el scroll no permite llegar hasta el final del contenido. Esto obliga al usuario a no poder ver (ni interactuar con) el último partido de la jornada sin recurrir a un workaround como reducir el zoom del navegador.

## What Changes

- **Añadir padding inferior al contenedor scrollable del grid**: el `div.min-w-max` que envuelve las filas de la tabla no tiene espacio en la parte inferior, haciendo que la última fila quede cortada por el borde del contenedor padre.
- **Revisar que el contenedor padre no recorta el scroll**: el `div.flex-1.overflow-hidden` que envuelve el área scrollable puede estar forzando un clip prematuro que impide que `scrollTop` llegue al valor máximo necesario para mostrar la última fila completa.

## Capabilities

### Modified Capabilities

<!-- No hay capabilities nuevas; es una corrección de layout CSS. -->

## Impact

- `src/App.tsx`: ajuste de clases Tailwind en el contenedor scrollable y/o en el wrapper interior `min-w-max`.
- Sin cambios en lógica, datos ni estilos de impresión.
- Sin cambios en la base de datos.
