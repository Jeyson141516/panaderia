import { toast } from './ui.js';
import { iniciarSesion } from './auth.js';

const formLogin = document.getElementById('formLogin');
const loginError = document.getElementById('loginError');

function mostrarError(mensaje) {
    loginError.textContent = mensaje;
    loginError.hidden = false;
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

    const email = document.getElementById('loginEmail').value.trim();
    const clave = document.getElementById('loginClave').value;

    if (!email || !clave) {
        mostrarError("Ingresa tu correo y contraseña.");
        return;
    }

    try {
        const usuario = await iniciarSesion(email, clave);
        loginError.hidden = true;
        toast(`¡Bienvenido, ${usuario.email}!`);
        setTimeout(() => window.location.replace('index.html'), 600);
    } catch (error) {
        const mensaje = traducirError(error.code);
        mostrarError(mensaje);
        toast(mensaje, "error");
    }
});
