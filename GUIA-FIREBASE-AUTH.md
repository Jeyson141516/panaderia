# Guía rápida: Alta de usuarios en Firebase Authentication

La aplicación ahora usa **Firebase Authentication (Correo/Contraseña)**. Ya no hay
usuario fijo en el código: cada familiar debe tener una cuenta creada en Firebase.

---

## 1. Habilitar el método de acceso

1. Ve a la **Firebase Console**: https://console.firebase.google.com
2. Abre el proyecto **`panaderiaapp-fe8cf`**.
3. En el menú lateral: **Build → Authentication**.
4. Haz clic en **Get started** (primera vez).
5. Ve a la pestaña **Sign-in method** (Método de acceso).
6. Localiza **Email/Password** (Correo/Contraseña) y actívalo (Enable).
7. Guarda los cambios.

> Sin este paso, el login devolverá el error
> `auth/operation-not-allowed`.

## 2. Crear el usuario administrador (tú, steven)

1. En **Authentication**, ve a la pestaña **Users** (Usuarios).
2. Haz clic en **Add user** (Añadir usuario).
3. Completa:
   - **Email**: usa un correo real, ej. `steven_admin@correo.com`
   - **Password**: escribe una contraseña segura (ya NO es `14127722`).
   - Puedes desmarcar *"Email password reset"* / confirmar sin envío de correo si no quieres verificación.
4. Haz clic en **Add user**.

## 3. Crear usuarios para los demás familiares

Repite el paso 2 por cada persona (puedes crear tantos como necesites):

- **Email**: el correo de cada familiar (se usará para iniciar sesión).
- **Password**: la contraseña que tú elijas y les comuniques.

Cada uno inicia sesión desde `login.html` con su propio **correo y contraseña**.

## 4. Probar el inicio de sesión

1. Abre `login.html` (o cualquier otra página, te redirigirá al login).
2. Ingresa el correo y la contraseña de la cuenta creada.
3. Deberías entrar al panel. El correo aparece abajo en la barra lateral.
4. El botón **Cerrar sesión** (`signOut`) te devuelve al login.

## 5. (Recomendado) Proteger los datos de Firestore

Las reglas de la base de datos siguen abiertas para que nada se rompa.
Cuando todos los usuarios ya inicien sesión correctamente:

1. Copia el contenido de `backend/firebase/firestore.rules.secure.example`
   sobre `backend/firebase/firestore.rules`.
2. Sustituye el correo del administrador en la lista `isAdmin()`.
3. Despliega las reglas (Cloud Firestore → Rules → Publish).
4. Activa **App Check** en la consola (Build → App Check) para proteger la cuota.

## Notas técnicas

- La sesión la gestiona Firebase automáticamente (token + persistencia en
  `localStorage` del navegador). No se guardan credenciales en el código.
- El Route Guard usa `onAuthStateChanged`: mientras se verifica la sesión se
  muestra un spinner y el contenido permanece oculto.
- Si un usuario sin sesión abre cualquier página directamente, es redirigido
  al login al instante.
