# Especificación: Inventario de Referencias a Brafa

## Resumen
Documentación completa de todas las referencias a "Brafa" encontradas en la aplicación.

## Referencia por Archivo

### 1. `src/components/LandingPage.tsx`

#### Ref 1.1: Encabezado principal
- **Línea:** ~27
- **Contenido:** `<h1>BRAFA 3x3 <span className="text-[#e94560]">HUB</span></h1>`
- **Cambio:** → `3x3 TOURNAMENT HUB`
- **Impacto:** Visible en landing page
- **Prioridad:** Alta

#### Ref 1.2: Footer de página
- **Línea:** ~210
- **Contenido:** `Powered by BRAFA Technology · {año}`
- **Cambio:** → `Tournament Management System · {año}`
- **Impacto:** Visible en footer
- **Prioridad:** Alta

---

### 2. `src/App.tsx`

#### Ref 2.1: Logo de Brafa (import)
- **Línea:** ~40
- **Contenido:** `import brafaLogo from '../images/logo.jpeg';`
- **Cambio:** Remover import y uso
- **Impacto:** Imagen no se cargará
- **Prioridad:** Media (puede removerse o hacerse configurable)

#### Ref 2.2: Print header - FUNDACIÓ BRAFA
- **Línea:** ~1521-1532
- **Contenido:** `<span className="print-brafa-title-big">FUNDACIÓ BRAFA</span>`
- **Cambio:** → Usar nombre del torneo o remover
- **Impacto:** Impresión
- **Prioridad:** Alta

#### Ref 2.3: Print header - Logo
- **Línea:** ~1524
- **Contenido:** `<img src={brafaLogo} alt="BRAFA" className="print-brafa-rings" />`
- **Cambio:** Remover línea
- **Impacto:** Impresión (sin logo)
- **Prioridad:** Media

#### Ref 2.4: Ubicación - Pistes Brafa
- **Línea:** ~1533
- **Contenido:** `<span className="print-brafa-location-name">Pistes Brafa Nou Barris</span>`
- **Cambio:** → Hacer configurable o remover
- **Impacto:** Impresión
- **Prioridad:** Alta

#### Ref 2.5: Motor de calendarios
- **Línea:** ~2152
- **Contenido:** `<span className="text-slate-400">Motor de Calendarios BRAFA v3.0</span>`
- **Cambio:** → `Schedule Engine v3.0`
- **Impacto:** Footer visible
- **Prioridad:** Alta

#### Ref 2.6: QR alt text
- **Línea:** ~1035
- **Contenido:** `<img class="qr-img" src="${qrDataUrl}" alt="QR vivo" />`
- **Nota:** No contiene "Brafa", pero revisar contexto

---

### 3. `src/constants/tournament.ts`

#### Ref 3.1: Equipo ejemplo
- **Línea:** ~30
- **Contenido:** `ALV F,Brafa girls`
- **Cambio:** Remover línea o reemplazar con nombre genérico
- **Impacto:** Datos de muestra
- **Prioridad:** Media

---

### 4. `src/index.css`

#### Ref 4.1: Comentario de sección
- **Línea:** ~60
- **Contenido:** `/* ── Cabecera BRAFA (solo impresión) ── */`
- **Cambio:** → `/* ── Cabecera de Impresión ── */` o similar
- **Impacto:** Comentario interno
- **Prioridad:** Baja

#### Ref 4.2-4.20: Clases CSS con prefijo "brafa"
- **Líneas:** 61, 73, 79, 86, 93, 99, 108, 117, 126, 135, 143, 151, 164, 175, 187, 199-202, 205, 213
- **Patrón:** `.print-brafa-*`
- **Nota:** Estos son nombres de clases internos, pueden mantenerse
- **Recomendación:** Dejar igual (no son visibles para usuario)

---

## Plan de Acción Resumido

| Prioridad | Ref | Acción | Estado |
|-----------|-----|--------|--------|
| Alta | 1.1 | Cambiar \"BRAFA 3x3 HUB\" → \"3x3 TOURNAMENT HUB\" | ✅ Hacer |
| Alta | 1.2 | Cambiar footer \"BRAFA Technology\" → \"Management System\" | ✅ Hacer |
| Alta | 3.1 | Remover \"Brafa girls\" de muestra | ✅ Hacer |
| Excluido | 2.2 | Remover \"FUNDACIÓ BRAFA\" (PDF) | ⏸️ Por ahora no |
| Excluido | 2.4 | Remover \"Pistes Brafa Nou Barris\" (PDF) | ⏸️ Por ahora no |
| Excluido | 2.5 | Cambiar \"BRAFA v3.0\" (PDF) | ⏸️ Por ahora no |
| Excluido | 2.1 | Remover logo import (PDF) | ⏸️ Por ahora no |
| Excluido | 2.3 | Remover logo de impresión (PDF) | ⏸️ Por ahora no |
| Excluido | 4.1 | Actualizar comentario CSS (PDF) | ⏸️ Por ahora no |
| Excluido | 4.2-4.20 | Clases CSS print (PDF) | ⏸️ Por ahora no |

---

## Validación Post-Implementación

**Checklist:**
```bash
# Búsqueda de referencias a Brafa (excluir PDF)
grep -r "Brafa" src/ --exclude-dir=node_modules | grep -v print-brafa

# Búsqueda de BRAFA en UI
grep -r "BRAFA" src/ --exclude-dir=node_modules | grep -v print-brafa | grep -v "@" 

# Búsqueda de brafa en configurables
grep -r "brafa" src/ --exclude-dir=node_modules | grep -v print-brafa | grep -v index.css
```

**Resultado esperado (con PDF excluido):**
- ✅ Cero menciones en LandingPage.tsx
- ✅ Cero menciones en constants/tournament.ts  
- ℹ️ Menciones en CSS/App.tsx con prefijo `print-brafa` se ignoran (fuera de alcance)
