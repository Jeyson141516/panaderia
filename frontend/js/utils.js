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
export function validarTelefono(valor) {
    const limpio = limpiarTexto(valor, 20).replace(/[^0-9+]/g, "");
    if (limpio.length > 15) return "";
    return limpio;
}
