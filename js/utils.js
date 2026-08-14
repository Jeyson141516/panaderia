export function normalizarTexto(texto) {
    return (texto || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/**
 * Sanea texto libre: quita caracteres de control, colapsa espacios,
 * recorta y limita la longitud máxima.
 * @param {string} valor
 * @param {number} maxLongitud
 * @returns {string}
 */
export function limpiarTexto(valor, maxLongitud = 200) {
    const limpio = String(valor || "")
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const max = Math.max(1, parseInt(maxLongitud, 10) || 200);
    return limpio.slice(0, max);
}

/**
 * Valida un correo electrónico básico.
 * @param {string} email
 * @returns {boolean}
 */
export function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").trim());
}

/**
 * Valida un número entero dentro de un rango. Devuelve el entero o null.
 * @param {any} valor
 * @param {number} min
 * @param {number} max
 * @returns {number|null}
 */
export function validarEntero(valor, min, max) {
    const n = parseInt(valor, 10);
    if (!Number.isFinite(n)) return null;
    if (n < min || n > max) return null;
    return n;
}

/**
 * Valida un monto (2 decimales) dentro de un rango. Devuelve el número o null.
 * @param {any} valor
 * @param {number} min
 * @param {number} max
 * @returns {number|null}
 */
export function validarMonto(valor, min = 0.01, max = 1000000) {
    const n = parseFloat(String(valor).replace(/\s/g, ""));
    if (!Number.isFinite(n)) return null;
    const redondeado = Math.round(n * 100) / 100;
    if (redondeado < min || redondeado > max) return null;
    return redondeado;
}

/**
 * Valida un teléfono: solo dígitos (y opcional + - espacios). Máx 15 dígitos.
 * @param {string} valor
 * @returns {string}
 */
/**
 * Ejecuta un callback asíncrono bloqueando el botón durante la petición
 * para evitar dobles envíos. El botón se restaura siempre (éxito o error)
 * gracias a un bloque try/finally.
 * @param {HTMLButtonElement} boton Botón a bloquear temporalmente.
 * @param {() => Promise<any>} callbackAsincrono Operación a ejecutar (ej. guardar en Firestore).
 * @param {string} textoCargando Texto/icono mostrado mientras se procesa.
 * @returns {Promise<void>}
 */
export async function ejecutarConBotonBloqueado(boton, callbackAsincrono, textoCargando = "Procesando...") {
    if (!boton) {
        await callbackAsincrono();
        return;
    }

    const estadoOriginal = {
        disabled: boton.disabled,
        innerHTML: boton.innerHTML,
        cursor: boton.style.cursor,
        opacity: boton.style.opacity
    };

    boton.disabled = true;
    boton.style.cursor = "not-allowed";
    boton.style.opacity = "0.65";
    boton.innerHTML = `⏳ ${textoCargando}`;

    try {
        await callbackAsincrono();
    } finally {
        boton.disabled = estadoOriginal.disabled;
        boton.style.cursor = estadoOriginal.cursor;
        boton.style.opacity = estadoOriginal.opacity;
        boton.innerHTML = estadoOriginal.innerHTML;
    }
}

export function validarTelefono(valor) {
    const limpio = limpiarTexto(valor, 20).replace(/[^0-9+]/g, "");
    if (limpio.length > 15) return "";
    return limpio;
}

/* ---------- Caché ligera en localStorage ---------- */

const PREFIJO_CACHE = 'panaderia-cache:';

/**
 * Lee un valor cacheado en localStorage con vigencia limitada.
 * Sirve para datos casi estáticos (catálogos, listas de referencia)
 * y evita repetir consultas a la red en cada navegación.
 * @param {string} clave Identificador del dato (se prefija automáticamente).
 * @param {number} ttlMs Vigencia máxima en milisegundos.
 * @returns {Array|null} Datos guardados o null si no hay o caducó.
 */
export function leerCache(clave, ttlMs) {
    try {
        const crudo = localStorage.getItem(PREFIJO_CACHE + clave);
        if (!crudo) return null;
        const registro = JSON.parse(crudo);
        if (!registro || !Array.isArray(registro.datos) || !registro.tiempo) return null;
        if (ttlMs && Date.now() - registro.tiempo > ttlMs) return null;
        return registro.datos;
    } catch (e) {
        return null;
    }
}

/**
 * Guarda un valor en la caché de localStorage.
 * @param {string} clave
 * @param {Array} datos
 */
export function guardarCache(clave, datos) {
    try {
        localStorage.setItem(PREFIJO_CACHE + clave, JSON.stringify({
            tiempo: Date.now(),
            datos
        }));
    } catch (e) {
        // cuota llena o almacenamiento no disponible: se ignora
    }
}
