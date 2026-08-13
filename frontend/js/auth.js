/* ============================================================
   Autenticación y Route Guard — Panadería Familiar
   ------------------------------------------------------------
   - Usa Firebase Authentication (método Correo/Contraseña).
   - La sesión la gestiona Firebase automáticamente (token +
     persistencia en localStorage del navegador).
   - El Route Guard usa onAuthStateChanged para redirigir o
     revelar el contenido una vez conocido el estado real.
   ============================================================ */
import { auth } from './firebase-config.js';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Persistencia automática de sesión (localStorage del navegador)
setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("Error al configurar persistencia de sesión:", error);
});

/* ---------- API de autenticación ---------- */

export async function iniciarSesion(email, clave) {
    const credencial = await signInWithEmailAndPassword(auth, email, clave);
    return credencial.user;
}

export async function cerrarSesion() {
    await signOut(auth);
}

export function obtenerUsuario() {
    return auth.currentUser;
}

export function estaAutenticado() {
    return auth.currentUser != null;
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

/* ---------- Route Guard ---------- */
onAuthStateChanged(auth, (usuario) => {
    const pagina = obtenerNombrePagina();

    if (pagina === "login.html") {
        if (usuario) {
            window.location.replace("index.html");
        } else {
            revelarContenido();
        }
        return;
    }

    // Cualquier otra página es protegida
    if (usuario) {
        revelarContenido();

        const spanUsuario = document.getElementById("navUsuario");
        if (spanUsuario) spanUsuario.textContent = usuario.email || usuario.displayName || "usuario";
    } else {
        // Sin sesión: redirige al login de inmediato (bloquea el contenido)
        window.location.replace("login.html");
    }
});

/* ---------- Botón de "Cerrar sesión" ---------- */
const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        try {
            await cerrarSesion();
        } finally {
            window.location.replace("login.html");
        }
    });
}

window.PanaderiaAuth = {
    iniciarSesion,
    cerrarSesion,
    obtenerUsuario,
    estaAutenticado
};
