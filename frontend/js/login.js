import { toast } from './ui.js';

const formLogin = document.getElementById('formLogin');
const loginError = document.getElementById('loginError');

function mostrarError(mensaje) {
    loginError.textContent = mensaje;
    loginError.hidden = false;
}

formLogin.addEventListener('submit', (e) => {
    e.preventDefault();

    const usuario = document.getElementById('loginUsuario').value.trim();
    const clave = document.getElementById('loginClave').value;

    if (!usuario || !clave) {
        mostrarError("Ingresa usuario y contraseña.");
        return;
    }

    if (window.PanaderiaAuth.iniciarSesion(usuario, clave)) {
        loginError.hidden = true;
        toast(`¡Bienvenido, ${usuario}!`);
        setTimeout(() => window.location.replace('index.html'), 600);
    } else {
        mostrarError("Usuario o contraseña incorrectos.");
        toast("Credenciales incorrectas.", "error");
    }
});
