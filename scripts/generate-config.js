/* ============================================================
   Generador de configuración — Panadería Familiar
   ------------------------------------------------------------
   Lee .env (raíz) y genera:
     1. frontend/js/config.js      -> config para el navegador
     2. backend/functions/.env     -> variables para las Cloud Functions

   Uso:  node scripts/generate-config.js
   Requiere: Node.js (sin dependencias externas).
   ============================================================ */
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const RUTA_ENV = path.join(RAIZ, ".env");
const RUTA_CONFIG_JS = path.join(RAIZ, "frontend", "js", "config.js");
const RUTA_CONFIG_EXAMPLE = path.join(RAIZ, "frontend", "js", "config.example.js");
const RUTA_ENV_FUNCTIONS = path.join(RAIZ, "backend", "functions", ".env");

const REQUERIDAS = [
    "FIREBASE_API_KEY",
    "FIREBASE_AUTH_DOMAIN",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_STORAGE_BUCKET",
    "FIREBASE_MESSAGING_SENDER_ID",
    "FIREBASE_APP_ID",
    "FIREBASE_MEASUREMENT_ID"
];

function leerEnv(ruta) {
    const contenido = fs.existsSync(ruta) ? fs.readFileSync(ruta, "utf8") : "";
    const vars = {};
    contenido.split(/\r?\n/).forEach((linea) => {
        const limpia = linea.trim();
        if (!limpia || limpia.startsWith("#")) return;
        const idx = limpia.indexOf("=");
        if (idx === -1) return;
        const clave = limpia.slice(0, idx).trim();
        const valor = limpia.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        vars[clave] = valor;
    });
    return vars;
}

function extraer(vars, clave) {
    const v = vars[clave];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : "";
}

function lista(vars, clave) {
    return extraer(vars, clave)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

function entero(vars, clave, defecto) {
    const n = parseInt(extraer(vars, clave), 10);
    return Number.isFinite(n) && n > 0 ? n : defecto;
}

function generarConfigEjemplo() {
    return `/* ============================================================
   Plantilla de configuración (valores de ejemplo).
   El archivo REAL frontend/js/config.js se genera automáticamente
   con "npm run config" a partir de .env y NO debe subirse a git.
   ============================================================ */
export const FIREBASE_CONFIG = {
    apiKey: "TU_API_KEY",
    authDomain: "tu-proyecto.firebaseapp.com",
    projectId: "tu-proyecto",
    storageBucket: "tu-proyecto.firebasestorage.app",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxxxxxx",
    measurementId: "G-XXXXXXXXXX"
};

export const SESSION_TIMEOUT_MIN = 25;

export const CORS_ALLOWED_ORIGINS = ["http://localhost:5500", "http://127.0.0.1:5500"];

export const ADMIN_EMAILS = [];

export const ADMIN_PIN = "1234";
`;
}

function principal() {
    const env = leerEnv(RUTA_ENV);
    const faltantes = REQUERIDAS.filter((k) => !env[k]);
    if (faltantes.length > 0) {
        console.error("[generate-config] Faltan variables en .env: " + faltantes.join(", "));
        console.error("[generate-config] Copia .env.example a .env y completa los valores.");
        process.exit(1);
    }

    const firebaseConfig = {
        apiKey: env.FIREBASE_API_KEY,
        authDomain: env.FIREBASE_AUTH_DOMAIN,
        projectId: env.FIREBASE_PROJECT_ID,
        storageBucket: env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
        appId: env.FIREBASE_APP_ID,
        measurementId: env.FIREBASE_MEASUREMENT_ID
    };

    const sessionTimeoutMin = entero(env, "SESSION_TIMEOUT_MIN", 25);
    const corsAllowedOrigins = lista(env, "CORS_ALLOWED_ORIGINS");
    const adminEmails = lista(env, "ADMIN_EMAILS");
    const adminPin = extraer(env, "ADMIN_PIN");

    const json = (v) => JSON.stringify(v, null, 4);

    const configJs = `/* ============================================================
   CONFIGURACIÓN GENERADA AUTOMÁTICAMENTE
   Archivo producido por scripts/generate-config.js a partir de .env.
   NO edites a mano: tus cambios se sobrescribirán con "npm run config".
   Este archivo está excluido de git (.gitignore).
   ============================================================ */
export const FIREBASE_CONFIG = ${json(firebaseConfig)};

export const SESSION_TIMEOUT_MIN = ${sessionTimeoutMin};

export const CORS_ALLOWED_ORIGINS = ${json(corsAllowedOrigins)};

export const ADMIN_EMAILS = ${json(adminEmails)};

export const ADMIN_PIN = ${json(adminPin)};
`;

    fs.writeFileSync(RUTA_CONFIG_JS, configJs, "utf8");
    console.log("[generate-config] OK -> frontend/js/config.js");

    fs.writeFileSync(RUTA_CONFIG_EXAMPLE, generarConfigEjemplo(), "utf8");
    console.log("[generate-config] OK -> frontend/js/config.example.js (plantilla)");

    const envFunctions = [
        "# Generado por scripts/generate-config.js a partir de .env. No editar.",
        "ADMIN_EMAILS=" + extraer(env, "ADMIN_EMAILS"),
        "CORS_ALLOWED_ORIGINS=" + extraer(env, "CORS_ALLOWED_ORIGINS")
    ].join("\n") + "\n";

    fs.mkdirSync(path.dirname(RUTA_ENV_FUNCTIONS), { recursive: true });
    fs.writeFileSync(RUTA_ENV_FUNCTIONS, envFunctions, "utf8");
    console.log("[generate-config] OK -> backend/functions/.env");
}

principal();
