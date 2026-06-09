# Tareas: Remover Branding de Brafa

**Nota:** Todos los cambios relacionados con PDF/impresión se excluyen por ahora.

## Task 1: Actualizar LandingPage.tsx
**Descripción:** Remover referencias a "Brafa" del componente de página de inicio

**Cambios específicos:**
- [x] Línea ~27: Reemplazar "BRAFA 3x3 HUB" por "3x3 TOURNAMENT HUB"
- [x] Línea ~210: Reemplazar footer "Powered by BRAFA Technology" por "Tournament Management System"

**Validación:**
- La página de inicio no contiene "Brafa"
- El título es genérico
- El footer no menciona Brafa

---

## Task 2: Actualizar Constantes
**Descripción:** Remover equipo de ejemplo "Brafa girls"

**Cambios específicos:**
- [x] Línea ~30 en `src/constants/tournament.ts`: Remover o reemplazar "Brafa girls"

**Opciones:**
1. Remover la línea completamente
2. Reemplazar con otro nombre genérico (ej: "Elite Girls")

**Validación:**
- No hay "Brafa" en los equipos de muestra

---

## Task 3: Testing y Validación Final
**Descripción:** Verificar que no quedan referencias a Brafa en UI (excluyendo PDF)

**Pasos:**
- [x] Ejecutar búsqueda global: grep -r "Brafa" src/ --exclude-dir=node_modules
- [x] Verificar UI no muestra "Brafa"
- [x] Verificar landing page
- [x] Buscar variaciones: "brafa", "BRAFA", "Brafa"

**Validación Final:**
- ✅ Cero menciones de "Brafa" en LandingPage.tsx
- ✅ Cero menciones de "Brafa" en constants/tournament.ts
- ✅ Aplicación se ve profesional en UI
- ℹ️ Referencias en PDF quedan por ahora intactas
