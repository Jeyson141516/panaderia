// Importa las funciones necesarias desde la CDN oficial de Firebase para navegadores
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";

// Configuración de Firebase.
// NOTA: una API key de Firebase Web NO es un secreto (viaja en el cliente),
// pero DEBES activar "App Check" y restringir la API key en la consola de
// Google Cloud para evitar abusos (uso de cuota, lecturas/escrituras externas).
const firebaseConfig = {
    apiKey: "AIzaSyAXeVsuqLMEgzT2mmxCs4xgpiMHvjQxuiI",
    authDomain: "panaderiaapp-fe8cf.firebaseapp.com",
    projectId: "panaderiaapp-fe8cf",
    storageBucket: "panaderiaapp-fe8cf.firebasestorage.app",
    messagingSenderId: "878317994126",
    appId: "1:878317994126:web:52f9937fbf21bc4eff09df",
    measurementId: "G-0DGR0BB3ND"
};

const app = initializeApp(firebaseConfig);

let analytics = null;
try {
    analytics = getAnalytics(app);
} catch (error) {
    console.warn("Analytics no disponible:", error);
}

export const db = getFirestore(app);
