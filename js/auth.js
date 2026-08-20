/* ============================================================
   Autenticación y Route Guard — Panadería El Vacán
   ------------------------------------------------------------
   - Usa Firebase Authentication (método Correo/Contraseña).
   - La sesión la gestiona Firebase automáticamente (token +
     persistencia en localStorage del navegador).
   - El Route Guard usa onAuthStateChanged para redirigir o
     revelar el contenido una vez conocido el estado real.
   - Verifica el campo "estado" en la colección "usuarios"
     para bloquear cuentas desactivadas.
   ============================================================ */
import { auth } from './firebase-config.js';
import { iniciarControlInactividad, detenerControlInactividad } from './session.js';
import { inicializarTema, vincularBotones } from './theme.js';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let _usuarioRol = null;
let _usuarioDatos = null;

// Sistema de temas (claro/oscuro): aplica la preferencia guardada y
// activa los botones de alternancia de todas las páginas.
inicializarTema();
vincularBotones();

// Persistencia automática de sesión (localStorage del navegador)
setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("Error al configurar persistencia de sesión:", error);
});

/* ---------- Expiración por inactividad ---------- */

// Elimina rastros de sesión del navegador (Firebase guarda en localStorage).
function limpiarAlmacenamientoSesion() {
    const clavesFirebase = [];
    for (let i = 0; i < localStorage.length; i++) {
        const clave = localStorage.key(i);
        if (clave && clave.indexOf("firebase:") === 0) {
            clavesFirebase.push(clave);
        }
    }
    clavesFirebase.forEach((clave) => localStorage.removeItem(clave));
    sessionStorage.clear();
}

// Se ejecuta cuando el usuario supera el tiempo de inactividad.
async function expulsarPorInactividad() {
    try {
        await cerrarSesion();
    } catch (error) {
        console.error("Error al cerrar sesión por inactividad:", error);
    }
    limpiarAlmacenamientoSesion();
    try {
        sessionStorage.setItem("sesionExpirada", "1");
    } catch (e) {
        // ignore: puede fallar si storage no está disponible
    }
    window.location.replace("login.html?motivo=inactividad");
}

/* ---------- API de autenticación ---------- */

export async function iniciarSesion(email, clave) {
    const credencial = await signInWithEmailAndPassword(auth, email, clave);
    return credencial.user;
}

export async function cerrarSesion() {
    _usuarioRol = null;
    _usuarioDatos = null;
    await signOut(auth);
}

export function obtenerUsuario() {
    return auth.currentUser;
}

export function estaAutenticado() {
    return auth.currentUser != null;
}

/**
 * Verifica que el usuario autenticado tenga un documento activo
 * en la colección "usuarios". Devuelve los datos del documento
 * o null si no existe / está inactivo.
 *
 * Se usa tanto al iniciar sesión como en el route guard de
 * cada página protegida.
 */
export async function verificarEstadoUsuario(usuario) {
    try {
        const { obtenerUsuarioPorUID } = await import('./usuarios.js');
        const datos = await obtenerUsuarioPorUID(usuario.uid);
        if (!datos) return null;
        if (datos.estado === 'inactivo') return null;
        return datos;
    } catch (err) {
        console.error('Error verificando estado del usuario:', err);
        return null;
    }
}

/**
 * Devuelve el rol cacheado del usuario ("admin" o "empleado").
 * Solo tiene datos después de que el route guard haya verificado
 * al usuario en la página.
 */
export function obtenerRol() {
    return _usuarioRol;
}

/**
 * Devuelve los datos completos del documento "usuarios" del
 * usuario actual (cacheados por el route guard).
 */
export function obtenerDatosUsuario() {
    return _usuarioDatos;
}

/* ---------- Utilidades ---------- */

function obtenerNombrePagina() {
    const ruta = window.location.pathname.split("/").pop();
    return (ruta || "index.html").toLowerCase();
}

function revelarContenido() {
    document.querySelectorAll("nav, main").forEach((el) => {
        el.style.visibility = "visible";
    });
    const loader = document.querySelector(".auth-loader");
    if (loader) loader.remove();
}

/**
 * Elimina del DOM los enlaces de navegación que apuntan a módulos
 * de administración. Se ejecuta solo para usuarios con rol "empleado"
 * y evita que el contenido sea visible aunque se manipule el DOM desde F12.
 */
function _eliminarNavAdmin() {
    const HREFS_ADMIN = ['inventario.html', 'personal.html', 'reportes.html', 'usuarios.html'];
    document.querySelectorAll('nav ul li').forEach((li) => {
        const a = li.querySelector('a');
        if (a && HREFS_ADMIN.includes(a.getAttribute('href'))) {
            li.remove();
        }
    });
}

/** Páginas que solo un administrador puede acceder. */
const PAGINAS_ADMIN = ['inventario.html', 'personal.html', 'reportes.html', 'usuarios.html'];

/* ---------- Route Guard ---------- */
onAuthStateChanged(auth, async (usuario) => {
    const pagina = obtenerNombrePagina();

    if (pagina === "login.html") {
        detenerControlInactividad();
        if (usuario) {
            window.location.replace("index.html");
        } else {
            revelarContenido();
        }
        return;
    }

    // Cualquier otra página es protegida
    if (usuario) {
        // Verificar que la cuenta esté activa en Firestore
        const datos = await verificarEstadoUsuario(usuario);

        if (!datos) {
            // Cuenta inactiva o sin documento: cerrar sesión
            try { await cerrarSesion(); } catch (_) {}
            limpiarAlmacenamientoSesion();
            sessionStorage.setItem("cuentaDesactivada", "1");
            detenerControlInactividad();
            window.location.replace("login.html");
            return;
        }

        _usuarioRol = datos.rol || 'empleado';
        _usuarioDatos = datos;

        // Bloquear acceso a páginas de admin si el usuario es empleado
        if (PAGINAS_ADMIN.includes(pagina) && _usuarioRol !== 'admin') {
            window.location.replace("index.html");
            return;
        }

        // Eliminar enlaces de admin del DOM si el usuario es empleado
        if (_usuarioRol !== 'admin') {
            _eliminarNavAdmin();
        }

        revelarContenido();
        iniciarControlInactividad(expulsarPorInactividad);

        const spanUsuario = document.getElementById("navUsuario");
        if (spanUsuario) spanUsuario.textContent = usuario.email || usuario.displayName || "usuario";
    } else {
        // Sin sesión: redirige al login de inmediato (bloquea el contenido)
        detenerControlInactividad();
        window.location.replace("login.html");
    }
});

/* ---------- Botón de "Cerrar sesión" ---------- */
const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        detenerControlInactividad();
        try {
            await cerrarSesion();
        } finally {
            window.location.replace("login.html");
        }
    });
}
