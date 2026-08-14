// Importa las funciones necesarias desde la CDN oficial de Firebase para navegadores
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// La configuración se genera automáticamente a partir de .env con
// "npm run config" (ver scripts/generate-config.js). El archivo
// config.js NO se sube a git, por lo que aquí nunca hay claves en crudo.
import { FIREBASE_CONFIG } from './config.js';

// Configuración de Firebase.
// NOTA: una API key de Firebase Web NO es un secreto (viaja en el cliente),
// pero DEBES activar "App Check" y restringir la API key en la consola de
// Google Cloud para evitar abusos (uso de cuota, lecturas/escrituras externas).
const app = initializeApp(FIREBASE_CONFIG);

let analytics = null;
try {
    analytics = getAnalytics(app);
} catch (error) {
    console.warn("Analytics no disponible:", error);
}

// Exportamos la base de datos (Firestore) y la autenticación (Auth)
// para usarlas en los otros archivos JS
export const db = getFirestore(app);
export const auth = getAuth(app);
