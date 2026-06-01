## 1. Fix del scroll clipped en la vista de calendario/pistas

- [x] 1.1 En `src/App.tsx`, localizar el `div` con clases `min-w-max flex flex-col` que envuelve el header sticky y las filas de la tabla de horarios, y añadirle la clase `pb-4`
- [x] 1.2 En `src/index.css`, dentro del bloque `@media print`, añadir una regla para que `.min-w-max` tenga `padding-bottom: 0 !important`, evitando espacio en blanco extra al imprimir

## 2. Verificación

- [x] 2.1 Abrir la app en el navegador, cargar un torneig con partidos hasta el final del día y hacer scroll hasta el final: el último slot debe ser completamente visible
- [x] 2.2 Comprobar en Chrome, Safari y Firefox (o al menos en el navegador principal de uso)
- [x] 2.3 Hacer print/PDF y verificar que no aparece espacio en blanco extra al final de la tabla
