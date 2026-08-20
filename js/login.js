import { toast } from './ui.js';
import { iniciarSesion, cerrarSesion, verificarEstadoUsuario } from './auth.js';
import { limpiarTexto, validarEmail } from './utils.js';

const formLogin = document.getElementById('formLogin');
const loginError = document.getElementById('loginError');

function mostrarError(mensaje) {
    loginError.textContent = mensaje;
    loginError.hidden = false;
}

// Aviso de sesión expirada por inactividad (marca establecida por auth.js)
if (sessionStorage.getItem('sesionExpirada') === '1') {
    mostrarError('Tu sesión expiró por inactividad. Vuelve a iniciar sesión.');
    sessionStorage.removeItem('sesionExpirada');
}

// Aviso de cuenta desactivada (marca establecida por auth.js route guard)
if (sessionStorage.getItem('cuentaDesactivada') === '1') {
    mostrarError('Tu cuenta está desactivada. Contacta al administrador.');
    sessionStorage.removeItem('cuentaDesactivada');
}

function traducirError(codigo) {
    switch (codigo) {
        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential":
            return "Correo o contraseña incorrectos.";
        case "auth/invalid-email":
            return "Ingresa un correo electrónico válido.";
        case "auth/user-disabled":
            return "Esta cuenta fue deshabilitada.";
        case "auth/too-many-requests":
            return "Demasiados intentos fallidos. Intenta de nuevo más tarde.";
        case "auth/network-request-failed":
            return "Error de conexión. Verifica tu internet.";
        case "auth/operation-not-allowed":
            return "El método Correo/Contraseña no está habilitado en Firebase.";
        default:
            return "No se pudo iniciar sesión. Intenta de nuevo.";
    }
}

formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = limpiarTexto(document.getElementById('loginEmail').value, 254).toLowerCase();
    const clave = document.getElementById('loginClave').value;

    if (!email || !clave) {
        mostrarError("Ingresa tu correo y contraseña.");
        return;
    }

    if (!validarEmail(email)) {
        mostrarError("Ingresa un correo electrónico válido.");
        return;
    }

    try {
        const usuario = await iniciarSesion(email, clave);

        // Verificar que la cuenta esté activa en Firestore
        const datos = await verificarEstadoUsuario(usuario);

        if (!datos) {
            // Cuenta desactivada o sin documento: cerrar sesión de inmediato
            await cerrarSesion();
            mostrarError('Tu cuenta está desactivada. Contacta al administrador.');
            toast('Cuenta desactivada. No puedes iniciar sesión.', 'error');
            return;
        }

        loginError.hidden = true;
        toast(`¡Bienvenido, ${usuario.email}!`);
        setTimeout(() => window.location.replace('index.html'), 600);
    } catch (error) {
        const mensaje = traducirError(error.code);
        mostrarError(mensaje);
        toast(mensaje, "error");
    }
});
