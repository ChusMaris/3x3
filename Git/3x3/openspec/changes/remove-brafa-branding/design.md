# Diseño: Remover Branding de Brafa

## Estrategia General
La solución elimina referencias hardcodeadas a "Brafa" y reemplaza con valores configurables o genéricos.

## Componentes a Cambiar

**Nota:** Se excluyen todos los cambios relacionados con PDF/impresión.

### 1. Landing Page (`src/components/LandingPage.tsx`)
**Cambios:**
- Línea ~27: Reemplazar título "BRAFA 3x3 HUB" con "3x3 TOURNAMENT HUB"
- Línea ~210: Reemplazar footer "Powered by BRAFA Technology" con "Tournament Management System"

**Antes:**
```tsx
<h1>BRAFA 3x3 <span>HUB</span></h1>
// Footer: "Powered by BRAFA Technology · {año}"
```

**Después:**
```tsx
<h1>3x3 TOURNAMENT <span>HUB</span></h1>
// Footer: "Tournament Management System · {año}"
```

### 2. Constants (`src/constants/tournament.ts`)
**Cambios:**
- Línea ~30: Remover equipo "Brafa girls" de lista de muestra

**Opciones:**
1. Remover la línea completamente
2. Reemplazar con otro nombre genérico (ej: "Elite Girls")

## Archivos Modificados
1. `src/components/LandingPage.tsx`
2. `src/constants/tournament.ts`

## PDF - Excluido por Ahora
Los siguientes elementos relacionados con PDF quedan intactos:
- `App.tsx` líneas ~1521-1533 (header de impresión, logo, ubicación)
- `App.tsx` línea ~2152 (Motor de Calendarios BRAFA v3.0 - solo si está en PDF)
- `src/index.css` comentarios y clases `.print-brafa-*`

## Validación
- ✅ No más menciones de "Brafa" en UI visible
- ✅ No más "BRAFA" en footers o headers
- ✅ Impresión funcional sin branding específico
- ✅ Aplicación se ve profesional y genérica
