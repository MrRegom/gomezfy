# Gomezfy Music — PWA Mobile-First para iPhone

Reproductor de música estilo Spotify diseñado para iPhone (PWA Standalone), con máscara sobre YouTube sin anuncios, buscador en vivo, letras sincronizadas y soporte de perfiles aislados (Papá / Hijo).

---

## 🚀 Despliegue en Vercel ($0 Costo)

1. Sube este repositorio a tu cuenta de **GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: Gomezfy Music PWA inicial"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/gomezfy.git
   git push -u origin main
   ```

2. Entra en [vercel.com](https://vercel.com) e inicia sesión con tu cuenta de GitHub.
3. Haz clic en **"Add New..."** → **"Project"**.
4. Selecciona el repositorio `gomezfy` y presiona **Deploy**.
5. Vercel detectará automáticamente `vercel.json` y creará tu dominio seguro HTTPS (ejemplo: `https://gomezfy.vercel.app`).

---

## 📱 Instalación en iPhone

1. Abre el enlace `https://tu-proyecto.vercel.app` en **Safari** en tu iPhone.
2. Toca el botón **Compartir** (cuadrado con flecha hacia arriba en la barra inferior de Safari).
3. Desplázate hacia abajo y selecciona **"Agregar a pantalla de inicio"** (*Add to Home Screen*).
4. Toca **"Agregar"** en la esquina superior derecha.
5. ¡Listo! Se creará el ícono oficial de Gomezfy. Al abrirlo, se ejecutará en **pantalla completa** como una aplicación nativa de iOS, sin barras de navegación ni publicidad.

---

## 🧪 Prueba Local en tu PC

Para probar la aplicación y sus endpoints en tu máquina antes de subirla:
```bash
python dev_server.py
```
Abre en tu navegador: [http://127.0.0.1:3000](http://127.0.0.1:3000)
