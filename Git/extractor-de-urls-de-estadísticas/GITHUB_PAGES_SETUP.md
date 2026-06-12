# Configuración para GitHub Pages

Este proyecto está configurado para desplegarse automáticamente en GitHub Pages.

## 🚀 Pasos de Configuración (Una sola vez)

### 1. Configurar GitHub Pages en el repositorio

1. Ve a **Settings** en tu repositorio GitHub
2. En el menú lateral, selecciona **Pages** (bajo "Code and automation")
3. En **Build and deployment** -> **Source**, selecciona:
   - **GitHub Actions**
4. Haz clic en **Save** (si aparece)

### 2. Verificar permisos de GitHub Actions

1. Ve a **Settings** → **Actions** → **General**
2. En **Workflow permissions**, selecciona:
   - **Read and write permissions**
3. Haz clic en **Save**

### 3. Hacer push de los cambios

```bash
git add .
git commit -m "Configure GitHub Pages deployment"
git push
```

## ✅ Validación

Una vez configurado:

1. Ve a **Actions** en tu repositorio
2. Verás un workflow llamado "Deploy to GitHub Pages" ejecutándose
3. Una vez completado, tu sitio estará disponible en:
   ```
   https://ChusMaris.github.io/UrlExtrator/
   ```

## 📝 Scripts disponibles

- `npm run build:pages` - Compila para GitHub Pages
- `npm run dev` - Inicia el servidor de desarrollo local
- `npm run build` - Compila el proyecto completo (incluye servidor)

## 🔄 Despliegue automático

El workflow `.github/workflows/deploy.yml` se ejecuta automáticamente cuando:
- Haces push a las ramas `main` o `master`
- Manualmente desde la pestaña Actions

Sin necesidad de hacer nada manualmente, ¡el sitio se actualizará automáticamente!

## ⚙️ Configuración Vite

El proyecto ya tiene la configuración correcta en `vite.config.ts`:
```typescript
base: "/UrlExtrator/"
```

Esto es necesario porque GitHub Pages sirve tu sitio desde una subcarpeta.

---

**Nota**: El archivo `.nojekyll` le indica a GitHub Pages que no use Jekyll para procesar el sitio, permitiendo que Vite maneje correctamente los módulos.
