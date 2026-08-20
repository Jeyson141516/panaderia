/* ============================================================
   Gestión de usuarios (colección "usuarios") — Panadería El Vacán
   ------------------------------------------------------------
   - Cada documento usa el UID de Firebase Auth como ID.
   - Campos obligatorios: email, rol ("admin" | "empleado"),
     estado ("activo" | "inactivo").
   - Todo se resuelve desde el cliente con el SDK de Firebase
     estándar (sin Cloud Functions ni planes de pago).
   ============================================================ */
import { db, auth } from './firebase-config.js';
import {
    doc,
    getDoc,
    getDocs,
    collection,
    setDoc,
    updateDoc,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    createUserWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const COL_USUARIOS = 'usuarios';

/* ---------- API Firestore (lectura) ---------- */

/**
 * Obtiene el documento de un usuario por su UID.
 * @param {string} uid
 * @returns {Promise<object|null>} Datos del usuario o null si no existe.
 */
export async function obtenerUsuarioPorUID(uid) {
    const snap = await getDoc(doc(db, COL_USUARIOS, uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Obtiene todos los usuarios ordenados por email.
 * @returns {Promise<Array>}
 */
export async function listarUsuarios() {
    const snap = await getDocs(query(collection(db, COL_USUARIOS), orderBy("email")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Obtiene el rol del usuario actual desde Firestore.
 * @returns {Promise<string>} "admin", "empleado" o "empleado" (default).
 */
export async function obtenerRolUsuarioActual() {
    const user = auth.currentUser;
    if (!user) return 'empleado';
    const datos = await obtenerUsuarioPorUID(user.uid);
    return datos ? (datos.rol || 'empleado') : 'empleado';
}

/* ---------- API Firestore (escritura) ---------- */

/**
 * Actualiza el campo "estado" de un usuario en Firestore.
 * @param {string} uid
 * @param {"activo"|"inactivo"} nuevoEstado
 */
export async function actualizarEstado(uid, nuevoEstado) {
    await updateDoc(doc(db, COL_USUARIOS, uid), { estado: nuevoEstado });
}

/**
 * Crea un nuevo empleado: crea la cuenta en Firebase Auth,
 * escribe el documento en la colección "usuarios" y vuelve
 * a iniciar sesión como el administrador original.
 *
 * @param {string} email
 * @param {string} password - Contraseña temporal (mín. 6 caracteres).
 * @param {string} rol - "admin" o "empleado".
 * @returns {Promise<string>} UID del nuevo usuario.
 */
export async function crearEmpleado(email, password, rol = 'empleado') {
    const adminUser = auth.currentUser;
    if (!adminUser) throw new Error('No hay sesión de administrador activa.');

    // 1. Crear cuenta en Firebase Auth (firma al nuevo usuario automáticamente)
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const nuevoUID = cred.user.uid;

    // 2. Escribir documento en la colección "usuarios"
    await setDoc(doc(db, COL_USUARIOS, nuevoUID), {
        email: email.toLowerCase().trim(),
        rol,
        estado: 'activo',
        fechaCreacion: new Date()
    });

    // 3. Cerrar sesión del nuevo usuario (el admin re-autentica en admin-usuarios.js)
    await signOut(auth);
    return nuevoUID;
}

/**
 * Envía un correo de recuperación de contraseña al empleado.
 * El empleado recibirá un link para crear su propia contraseña
 * nueva. No se necesita Cloud Functions ni Admin SDK.
 *
 * @param {string} email - Correo del empleado.
 * @returns {Promise<void>}
 */
export async function enviarRecuperacionClave(email) {
    await sendPasswordResetEmail(auth, email);
}
