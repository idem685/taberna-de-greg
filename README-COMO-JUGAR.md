# 🍺 La Taberna del Viejo Greg — Guía para jugar

## Paso 1: Conseguir tu API Key de Gemini (IA GRATIS)

1. Abrí https://aistudio.google.com en tu navegador
2. Iniciá sesión con tu cuenta de Google
3. Hacé clic en **"Get API key"** (arriba a la izquierda)
4. Hacé clic en **"Create API key"**
5. Copiá la key que aparece (empieza con `AIza...`) — guardala, la necesitás en el Paso 3

---

## Paso 2: Subir el código a GitHub

1. Creá una cuenta gratis en https://github.com
2. Hacé clic en el **"+"** (arriba a la derecha) → **"New repository"**
3. Ponele un nombre (ej: `taberna-viejo-greg`)
4. Dejalo **Privado** (Private) y hacé clic en **"Create repository"**
5. En la página que aparece, hacé clic en **"uploading an existing file"**
6. **Descomprimí el archivo `.tar`** que tenés: hacé clic derecho → extraer
7. Arrastrá **todos los archivos y carpetas** de adentro al navegador (donde dice "drag files here")
8. Hacé clic en **"Commit changes"**

---

## Paso 3: Deployar en Railway (GRATIS)

1. Abrí https://railway.app y registrate con tu cuenta de GitHub
2. Hacé clic en **"New Project"**
3. Elegí **"Deploy from GitHub repo"**
4. Seleccioná tu repositorio `taberna-viejo-greg`
5. Railway va a detectar automáticamente que es Next.js y va a empezar a compilar

### Configurar las variables de entorno en Railway:
6. Hacé clic en tu proyecto → **"Variables"**
7. Agregá estas dos variables (hacé clic en "+ New Variable" para cada una):

   | Nombre | Valor |
   |--------|-------|
   | `GEMINI_API_KEY` | Tu key del Paso 1 (ej: `AIzaSy...`) |
   | `DATABASE_URL` | `file:./db/custom.db` |

8. Hacé clic en **"Deploy"** — Railway va a recompilar con las variables

### Obtener tu URL para jugar:
9. Hacé clic en **"Settings"** → **"Domains"** → **"Generate Domain"**
10. Te va a dar una URL tipo `taberna-viejo-greg.up.railway.app`
11. **¡Abrí esa URL y empezá a jugar!** 🎲

---

## ¿Algo no funciona?

- **Error "GEMINI_API_KEY no configurada"**: Verificá que agregaste la variable en Railway (Paso 3, punto 7)
- **La página no carga**: Esperá 2-3 minutos, Railway puede tardar en el primer deploy
- **Error al crear personaje**: Asegurate de que tu API key de Gemini sea válida (copiala de nuevo desde aistudio.google.com)
