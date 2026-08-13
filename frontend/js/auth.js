/* ============================================================
   Autenticación y Route Guard — Panadería Familiar
   ------------------------------------------------------------
   - Script clásico (no módulo) para ejecutarse de forma
     SINCRÓNICA desde <head> y bloquear el render de la página.
   - La sesión se persiste en localStorage.
   - Si NO hay sesión válida y la página es protegida, se
     redirige inmediatamente a login.html.
   ============================================================ */
(function () {
    "use strict";

    // Credenciales del administrador del sistema.
    // NOTA: al ser una app 100% de cliente (sin backend), esta
    // validación es solo un candado visual. Para seguridad real,
    // debe migrarse a Firebase Auth (ver firestore.rules.secure.example).
    var USUARIO_ADMIN = "steven_admin";
    var CLAVE_ADMIN = "14127722";

    var SESION_KEY = "panaderia_sesion";
    var SESION_DURACION_MS = 12 * 60 * 60 * 1000; // 12 horas

    function obtenerNombrePagina() {
        var ruta = window.location.pathname.split("/").pop();
        return (ruta || "index.html").toLowerCase();
    }

    function iniciarSesion(usuario, clave) {
        if (usuario === USUARIO_ADMIN && clave === CLAVE_ADMIN) {
            try {
                localStorage.setItem(SESION_KEY, JSON.stringify({
                    usuario: usuario,
                    iniciadoEn: Date.now()
                }));
                return true;
            } catch (error) {
                return false;
            }
        }
        return false;
    }

    function cerrarSesion() {
        localStorage.removeItem(SESION_KEY);
    }

    function estaAutenticado() {
        var raw = localStorage.getItem(SESION_KEY);
        if (!raw) return false;

        try {
            var sesion = JSON.parse(raw);
            if (!sesion.usuario) return false;
            if (Date.now() - sesion.iniciadoEn > SESION_DURACION_MS) {
                cerrarSesion();
                return false;
            }
            return true;
        } catch (error) {
            cerrarSesion();
            return false;
        }
    }

    function obtenerUsuario() {
        if (!estaAutenticado()) return null;
        try {
            return JSON.parse(localStorage.getItem(SESION_KEY)).usuario;
        } catch (error) {
            return null;
        }
    }

    // ---------- Route Guard ----------
    (function protegerRuta() {
        var pagina = obtenerNombrePagina();

        if (pagina === "login.html") {
            if (estaAutenticado()) {
                window.location.replace("index.html");
            }
            return;
        }

        // Cualquier otra página es protegida
        if (!estaAutenticado()) {
            window.location.replace("login.html");
        }
    })();

    // ---------- Botón de "Cerrar sesión" (si existe en la página) ----------
    document.addEventListener("DOMContentLoaded", function () {
        var btnLogout = document.getElementById("btnLogout");
        if (btnLogout) {
            btnLogout.addEventListener("click", function () {
                cerrarSesion();
                window.location.replace("login.html");
            });
        }

        var spanUsuario = document.getElementById("navUsuario");
        if (spanUsuario) {
            spanUsuario.textContent = obtenerUsuario() || "";
        }
    });

    window.PanaderiaAuth = {
        iniciarSesion: iniciarSesion,
        cerrarSesion: cerrarSesion,
        estaAutenticado: estaAutenticado,
        obtenerUsuario: obtenerUsuario
    };
})();
