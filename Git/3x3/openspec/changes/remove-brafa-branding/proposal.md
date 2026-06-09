# Propuesta: Remover Branding de Brafa de la Aplicación

## Problema
La aplicación contiene referencias al nombre y branding de "Brafa" en múltiples lugares:
- Encabezados de impresión con logo y texto "FUNDACIÓ BRAFA"
- Labels y footers que mencionan "BRAFA 3x3 HUB"
- Clases CSS con prefijo "brafa"
- Equipo de ejemplo "Brafa girls" en datos de prueba
- Motor de calendarios etiquetado como "Motor de Calendarios BRAFA"
- Ubicación en pistas "Pistes Brafa Nou Barris"

## Objetivo
Remover completamente todas las referencias al nombre y branding de "Brafa" de la aplicación, permitiendo que sea una solución genérica y reutilizable para otros torneos y organizaciones.

## Beneficios
- ✅ Aplicación agnóstica que no asume identidad de "Brafa"
- ✅ Mejor reusabilidad para otros torneos y organizaciones
- ✅ UI más limpia y profesional sin referencias hardcodeadas
- ✅ Mayor flexibilidad para customización por cliente

## Alcance
- Eliminar "BRAFA" de UI visible (landing page, labels)
- Reemplazar nombres hardcodeados con valores genéricos
- Remover equipos de ejemplo con "Brafa" en el nombre
- **Excluido por ahora:** Todo lo relacionado con PDF/impresión (header, footer, clases CSS de impresión)
