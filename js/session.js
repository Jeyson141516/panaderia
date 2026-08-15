/* ============================================================
   Control de inactividad de sesión — Panadería El Vacán
   ------------------------------------------------------------
   - Si no hay actividad (mouse, teclado, scroll, toque) durante
     SESSION_TIMEOUT_MIN minutos, se dispara el callback y la
     sesión se cierra automáticamente.
   - El tiempo se lee de config.js (generado desde .env).
   ============================================================  */
import { SESSION_TIMEOUT_MIN } from './config.js';

const ACTIVIDAD_MS = Math.max(1, SESSION_TIMEOUT_MIN) * 60 * 1000;

// Eventos que indican actividad del usuario
const EVENTOS_ACTIVIDAD = [
    "mousemove",
    "mousedown",
    "keydown",
    "touchstart",
    "scroll",
    "click"
];

let temporizador = null;
let activo = false;
let callbackExpiracion = null;

function limpiarTemporizador() {
    if (temporizador !== null) {
        clearTimeout(temporizador);
        temporizador = null;
    }
}

function expirar() {
    if (!activo) return;
    detenerControlInactividad();
    if (typeof callbackExpiracion === "function") {
        try {
            callbackExpiracion();
        } catch (error) {
            console.error("Error en expiración de sesión por inactividad:", error);
        }
    }
}

function reiniciar() {
    if (!activo) return;
    limpiarTemporizador();
    temporizador = setTimeout(expirar, ACTIVIDAD_MS);
}

/**
 * Inicia la vigilancia de inactividad.
 * @param {Function} alExpiar - callback que se ejecuta al expirar la sesión.
 */
export function iniciarControlInactividad(alExpiar) {
    if (activo) return;
    activo = true;
    callbackExpiracion = alExpiar;
    EVENTOS_ACTIVIDAD.forEach((evento) => {
        document.addEventListener(evento, reiniciar, { passive: true });
    });
    reiniciar();
}

/**
 * Detiene la vigilancia (se llama al cerrar sesión o al expirar).
 */
export function detenerControlInactividad() {
    activo = false;
    callbackExpiracion = null;
    limpiarTemporizador();
    EVENTOS_ACTIVIDAD.forEach((evento) => {
        document.removeEventListener(evento, reiniciar);
    });
}
