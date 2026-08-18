// Importa las funciones necesarias desde la CDN oficial de Firebase para navegadores
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    initializeFirestore,
    getFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

// --- Firestore con persistencia offline habilitada ---
// initializeFirestore permite configurar persistencia local (IndexedDB) al
// momento de crear la instancia. Esto reemplaza a la API deprecada
// enableIndexedDbPersistence() y soporta múltiples pestañas abiertas.
//
// Flujo offline → online:
//   1. Las escrituras (addDoc) se guardan localmente en IndexedDB.
//   2. Firestore marca los documentos como "con escrituras pendientes".
//   3. Cuando se restaura la conexión, Firestore sincroniza automáticamente
//      con la nube y resuelve serverTimestamp() con la hora real del servidor.
//   4. Las lecturas offline devuelven datos del caché local sin errores.
let db;
try {
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
        })
    });
} catch (error) {
    // initializeFirestore lanza si ya fue llamado para la misma app.
    // En ese caso, devolvemos la instancia existente.
    console.warn("Firestore ya inicializado, usando instancia existente:", error);
    db = getFirestore(app);
}

export { db };
export const auth = getAuth(app);

// --- Indicador visual de estado de red ---
// Muestra/oculta un banner discreto cuando el usuario está sin conexión.
// Firestore sigue funcionando offline; el aviso es solo para que el usuario
// sepa que los datos se sincronizarán cuando regrese el internet.
function _crearBannerOffline() {
    const banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.textContent = 'Sin conexión — los datos se guardarán localmente';
    Object.assign(banner.style, {
        display: 'none',
        position: 'fixed',
        bottom: '0',
        left: '0',
        right: '0',
        zIndex: '99999',
        background: '#e65100',
        color: '#fff',
        textAlign: 'center',
        padding: '8px 16px',
        fontSize: '14px',
        fontWeight: '600',
        fontFamily: 'inherit',
        boxShadow: '0 -2px 8px rgba(0,0,0,.2)'
    });
    document.body.appendChild(banner);
    return banner;
}

if (typeof window !== 'undefined') {
    const banner = _crearBannerOffline();

    window.addEventListener('offline', () => {
        banner.style.display = 'block';
        document.body.classList.add('offline');
    });

    window.addEventListener('online', () => {
        banner.style.display = 'none';
        document.body.classList.remove('offline');
    });

    // Estado inicial
    if (!navigator.onLine) {
        banner.style.display = 'block';
        document.body.classList.add('offline');
    }
}
