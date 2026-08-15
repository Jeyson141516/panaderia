/* ============================================================
   Sistema de temas (Modo Claro / Modo Oscuro) — Panadería El Vacán
   ------------------------------------------------------------
   - La elección del usuario se guarda en localStorage
     (clave 'panaderia-tema') y se conserva entre páginas.
   - Primera visita: respeta la preferencia del sistema operativo
     (prefers-color-scheme); si no hay preferencia, modo claro.
   - Para evitar parpadeos (FOUC), cada página aplica la
     preferencia en un script inline del <head> ANTES de pintar;
     este módulo sincroniza el ícono de los botones de alternancia
     y maneja los clics.
   ============================================================ */
const STORAGE_KEY = 'panaderia-tema';
const TEMA_OSCURO = 'oscuro';
const TEMA_CLARO = 'claro';

function temaGuardado() {
    try {
        const guardado = localStorage.getItem(STORAGE_KEY);
        if (guardado === TEMA_OSCURO || guardado === TEMA_CLARO) return guardado;
    } catch (e) {
        // almacenamiento no disponible: se usa la preferencia del SO
    }
    const prefiereOscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefiereOscuro ? TEMA_OSCURO : TEMA_CLARO;
}

function temaActual() {
    return document.documentElement.getAttribute('data-theme') === TEMA_OSCURO ? TEMA_OSCURO : TEMA_CLARO;
}

function actualizarIconos() {
    const oscuro = temaActual() === TEMA_OSCURO;
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
        const etiqueta = oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
        btn.setAttribute('aria-label', etiqueta);
        btn.setAttribute('title', etiqueta);
        btn.innerHTML = `<span class="toggle-icon" aria-hidden="true">${oscuro ? '☀️' : '🌙'}</span>`;
    });
}

export function aplicarTema(tema) {
    const valor = tema === TEMA_OSCURO ? TEMA_OSCURO : TEMA_CLARO;
    document.documentElement.setAttribute('data-theme', valor);
    try {
        localStorage.setItem(STORAGE_KEY, valor);
    } catch (e) {
        // almacenamiento no disponible: solo aplica en esta sesión
    }
    actualizarIconos();
}

export function alternarTema() {
    const nuevo = temaActual() === TEMA_OSCURO ? TEMA_CLARO : TEMA_OSCURO;
    aplicarTema(nuevo);
    return nuevo;
}

export function inicializarTema() {
    // El script inline del <head> ya aplicó data-theme; esto asegura la
    // coherencia si el atributo no está presente (p. ej. archivo abierto
    // directamente sin ese script).
    const actual = document.documentElement.getAttribute('data-theme');
    if (actual !== TEMA_OSCURO && actual !== TEMA_CLARO) {
        aplicarTema(temaGuardado());
    }
    actualizarIconos();
}

export function vincularBotones() {
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
        btn.addEventListener('click', alternarTema);
    });
}
