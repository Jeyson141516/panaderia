/* ============================================================
   Panel de administración de empleados — Panadería El Vacán
   ------------------------------------------------------------
   - Solo visible para usuarios con rol "admin".
   - Permite crear, desactivar/activar empleados y enviar
     correo de recuperación de contraseña.
   - Todo funciona desde el cliente sin Cloud Functions.
   - Se carga únicamente en usuarios.html.
   ============================================================ */
import { auth } from './firebase-config.js';
import { obtenerRol } from './auth.js';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    listarUsuarios,
    crearEmpleado,
    actualizarEstado,
    enviarRecuperacionClave
} from './usuarios.js';
import { toast, escapeHtml } from './ui.js';
import {
    limpiarTexto,
    validarEmail,
    ejecutarConBotonBloqueado,
    conTimeout
} from './utils.js';

/* ---------- Elementos del DOM ---------- */

const tablaEmpleados = document.getElementById('tablaEmpleados');

// Modal crear empleado
const modalCrear = document.getElementById('modalCrearEmpleado');
const cerrarModalCrear = document.getElementById('cerrarModalCrear');
const cancelarModalCrear = document.getElementById('cancelarModalCrear');
const formCrearEmpleado = document.getElementById('formCrearEmpleado');
const crearEmail = document.getElementById('crearEmail');
const crearClave = document.getElementById('crearClave');
const crearRol = document.getElementById('crearRol');

// Modal recuperar contraseña
const modalClave = document.getElementById('modalCambiarClave');
const cerrarModalClave = document.getElementById('cerrarModalClave');
const cancelarModalClave = document.getElementById('cancelarModalClave');
const enviarRecuperacionBtn = document.getElementById('enviarRecuperacionBtn');
const claveEmail = document.getElementById('claveEmail');

// Modal confirmar estado
const modalEstado = document.getElementById('modalConfirmarEstado');
const cerrarModalEstado = document.getElementById('cerrarModalEstado');
const cancelarModalEstado = document.getElementById('cancelarModalEstado');
const confirmarEstadoBtn = document.getElementById('confirmarEstadoBtn');
const estadoUid = document.getElementById('estadoUid');
const estadoEmail = document.getElementById('estadoEmail');
const estadoAccion = document.getElementById('estadoAccion');

let usuariosCache = [];

/* ---------- Renderizado ---------- */

function renderTabla(usuarios) {
    if (usuarios.length === 0) {
        tablaEmpleados.innerHTML = '<tr><td colspan="4" class="empty-cell">No hay empleados registrados.</td></tr>';
        return;
    }

    tablaEmpleados.innerHTML = usuarios.map((u) => {
        const esActivo = u.estado === 'activo';
        const badgeCls = esActivo ? 'pago' : 'adelanto';
        const badgeTxt = esActivo ? 'Activo' : 'Inactivo';
        const btnEstado = esActivo
            ? `<button type="button" class="btn-accion btn-desactivar" data-uid="${escapeHtml(u.id)}" data-email="${escapeHtml(u.email)}" title="Desactivar empleado">Desactivar</button>`
            : `<button type="button" class="btn-accion btn-activar" data-uid="${escapeHtml(u.id)}" data-email="${escapeHtml(u.email)}" title="Activar empleado">Activar</button>`;
        const rolBadge = u.rol === 'admin'
            ? '<span class="badge admin-badge">Admin</span>'
            : '<span class="badge empleado-badge">Empleado</span>';

        return `
        <tr>
            <td>${escapeHtml(u.email)}</td>
            <td>${rolBadge}</td>
            <td><span class="badge ${badgeCls}">${badgeTxt}</span></td>
            <td class="actions-cell">
                ${btnEstado}
                <button type="button" class="btn-accion btn-clave" data-email="${escapeHtml(u.email)}" title="Enviar correo de recuperación de contraseña">Recuperar clave</button>
            </td>
        </tr>`;
    }).join('');
}

async function cargarLista() {
    try {
        usuariosCache = await conTimeout(listarUsuarios(), 5000);
        renderTabla(usuariosCache);
    } catch (err) {
        if (err.message !== 'timeout') {
            console.error('Error cargando usuarios:', err);
            tablaEmpleados.innerHTML = '<tr><td colspan="4" class="empty-cell">Error al cargar empleados.</td></tr>';
        }
    }
}

/* ---------- Crear empleado ---------- */

document.getElementById('btnCrearEmpleado').addEventListener('click', () => {
    formCrearEmpleado.reset();
    crearRol.value = 'empleado';
    modalCrear.style.display = 'flex';
    crearEmail.focus();
});

cerrarModalCrear.addEventListener('click', () => { modalCrear.style.display = 'none'; });
cancelarModalCrear.addEventListener('click', () => { modalCrear.style.display = 'none'; });
modalCrear.addEventListener('click', (e) => { if (e.target === modalCrear) modalCrear.style.display = 'none'; });

formCrearEmpleado.addEventListener('submit', (e) => {
    e.preventDefault();

    ejecutarConBotonBloqueado(formCrearEmpleado.querySelector('[type="submit"]'), async () => {
        if (obtenerRol() !== 'admin') {
            toast('No tienes permiso para crear empleados.', 'error');
            return;
        }

        const email = limpiarTexto(crearEmail.value, 254).toLowerCase();
        const clave = crearClave.value;
        const rol = crearRol.value;

        if (!validarEmail(email)) {
            toast('Ingresa un correo electrónico válido.', 'warning');
            return;
        }
        if (!clave || clave.length < 6) {
            toast('La contraseña debe tener al menos 6 caracteres.', 'warning');
            return;
        }
        if (!['admin', 'empleado'].includes(rol)) {
            toast('Selecciona un rol válido.', 'warning');
            return;
        }

        const adminEmail = auth.currentUser ? auth.currentUser.email : '';

        try {
            await crearEmpleado(email, clave, rol);
            toast(`Empleado ${email} creado con éxito.`);
            modalCrear.style.display = 'none';

            if (adminEmail) {
                const adminClave = prompt('Empleado creado. Ingresa tu contraseña de administrador para continuar:');
                if (adminClave) {
                    try {
                        await signInWithEmailAndPassword(auth, adminEmail, adminClave);
                    } catch (reauthErr) {
                        console.error('Error re-autenticando admin:', reauthErr);
                        toast('No se pudo re-autenticar. Recarga la página e inicia sesión.', 'warning');
                    }
                } else {
                    toast('Recarga la página e inicia sesión para continuar.', 'warning');
                }
            }

            await cargarLista();
        } catch (err) {
            console.error('Error creando empleado:', err);
            const msg = err.code === 'auth/email-already-in-use'
                ? 'Este correo ya está registrado en Firebase Auth.'
                : (err.message || 'Error al crear el empleado.');
            toast(msg, 'error');
        }
    }, 'Creando...');
});

/* ---------- Recuperar contraseña ---------- */

function abrirModalClave(email) {
    claveEmail.textContent = email;
    enviarRecuperacionBtn.dataset.email = email;
    modalClave.style.display = 'flex';
    enviarRecuperacionBtn.focus();
}

cerrarModalClave.addEventListener('click', () => { modalClave.style.display = 'none'; });
cancelarModalClave.addEventListener('click', () => { modalClave.style.display = 'none'; });
modalClave.addEventListener('click', (e) => { if (e.target === modalClave) modalClave.style.display = 'none'; });

enviarRecuperacionBtn.addEventListener('click', async () => {
    if (obtenerRol() !== 'admin') {
        toast('No tienes permiso para recuperar contraseñas.', 'error');
        return;
    }

    const email = enviarRecuperacionBtn.dataset.email;
    if (!email) return;

    try {
        await enviarRecuperacionClave(email);
        toast(`Correo de recuperación enviado a ${email}.`);
        modalClave.style.display = 'none';
    } catch (err) {
        console.error('Error enviando recuperación:', err);
        const msg = err.code === 'auth/user-not-found'
            ? 'No se encontró una cuenta con ese correo.'
            : (err.message || 'Error al enviar el correo de recuperación.');
        toast(msg, 'error');
    }
});

/* ---------- Cambiar estado (activar/desactivar) ---------- */

function abrirModalEstado(uid, email, accion) {
    estadoUid.value = uid;
    estadoEmail.textContent = email;
    estadoAccion.textContent = accion === 'inactivar' ? 'desactivar' : 'activar';
    confirmarEstadoBtn.dataset.accion = accion;
    modalEstado.style.display = 'flex';
    confirmarEstadoBtn.focus();
}

cerrarModalEstado.addEventListener('click', () => { modalEstado.style.display = 'none'; });
cancelarModalEstado.addEventListener('click', () => { modalEstado.style.display = 'none'; });
modalEstado.addEventListener('click', (e) => { if (e.target === modalEstado) modalEstado.style.display = 'none'; });

confirmarEstadoBtn.addEventListener('click', async () => {
    if (obtenerRol() !== 'admin') {
        toast('No tienes permiso para cambiar el estado de empleados.', 'error');
        return;
    }

    const uid = estadoUid.value;
    const accion = confirmarEstadoBtn.dataset.accion;
    const nuevoEstado = accion === 'inactivar' ? 'inactivo' : 'activo';

    try {
        await actualizarEstado(uid, nuevoEstado);
        toast(`Empleado ${accion === 'inactivar' ? 'desactivado' : 'activado'} con éxito.`);
        modalEstado.style.display = 'none';
        await cargarLista();
    } catch (err) {
        console.error('Error cambiando estado:', err);
        toast('Error al actualizar el estado del empleado.', 'error');
    }
});

/* ---------- Delegación de eventos en la tabla ---------- */

tablaEmpleados.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.classList.contains('btn-clave')) {
        abrirModalClave(btn.dataset.email);
    } else if (btn.classList.contains('btn-desactivar')) {
        abrirModalEstado(btn.dataset.uid, btn.dataset.email, 'inactivar');
    } else if (btn.classList.contains('btn-activar')) {
        abrirModalEstado(btn.dataset.uid, btn.dataset.email, 'activar');
    }
});

/* ---------- Inicialización ---------- */

onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    try {
        const { obtenerUsuarioPorUID } = await import('./usuarios.js');
        const datos = await conTimeout(obtenerUsuarioPorUID(user.uid), 3000);

        if (datos && datos.rol === 'admin') {
            cargarLista();
        }
    } catch (err) {
        if (err.message !== 'timeout') {
            console.error('Error verificando rol para admin panel:', err);
        }
    }
});
