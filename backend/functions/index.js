/* ============================================================
   API segura (Cloud Functions v2) — Panadería El Vacán
   ------------------------------------------------------------
   - CORS estricto: solo origenes listados en .env
     (CORS_ALLOWED_ORIGINS, separados por comas).
   - Autenticación: exige token de Firebase en
     "Authorization: Bearer <token>".
   - Validación de datos en el servidor: NUNCA se confía en el
     cliente (los formularios web se pueden manipular).
   - Las eliminaciones/actualizaciones también están protegidas
     por las reglas de Firestore (backend/firebase/firestore.rules).

   Variables de entorno (backend/functions/.env, generado desde
   el .env raíz por scripts/generate-config.js):
     - CORS_ALLOWED_ORIGINS
     - ADMIN_EMAILS
   ============================================================ */
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

initializeApp();
const db = getFirestore();
const authAdmin = getAuth();

const ORIGENES_PERMITIDOS = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const EMAILS_ADMIN = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const LIMITES = {
    TEXTO: 80,
    CONCEPTO: 120,
    MONTO_MIN: 0.01,
    MONTO_MAX: 1000000,
    CANTIDAD_MAX: 999
};

const ESTADOS_PAGO = ["pagado", "debe", "abono"];

/* ---------- Utilidades de respuesta ---------- */

function escribirJson(res, codigo, cuerpo) {
    res.status(codigo).json(cuerpo);
}

function error(res, codigo, mensaje) {
    escribirJson(res, codigo, { ok: false, error: mensaje });
}

function errorHttp(mensaje, codigo) {
    return Object.assign(new Error(mensaje), { codigo });
}

/* ---------- Sanitización y validación ---------- */

function limpiarTexto(valor, maxLongitud) {
    return String(valor || "")
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLongitud);
}

function redondearMonto(valor) {
    const n = Number(valor);
    if (!Number.isFinite(n)) return null;
    const r = Math.round(n * 100) / 100;
    if (r < LIMITES.MONTO_MIN || r > LIMITES.MONTO_MAX) return null;
    return r;
}

function validarMonto(valor, nombreCampo) {
    const r = redondearMonto(valor);
    if (r === null) throw errorHttp(nombreCampo + " inválido", 400);
    return r;
}

/* ---------- CORS estricto ---------- */

function configurarCors(req, res) {
    const origen = req.headers.origin || "";

    // Solo se refleja el origen si está en la lista permitida.
    if (ORIGENES_PERMITIDOS.includes(origen)) {
        res.set("Access-Control-Allow-Origin", origen);
        res.set("Vary", "Origin");
    }

    res.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") {
        res.status(204).end();
        return true; // preflight respondido
    }
    return false;
}

/* ---------- Autenticación ---------- */

async function verificarToken(req) {
    const cabecera = req.headers.authorization || "";
    const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";
    if (!token) throw errorHttp("Token de autorización requerido", 401);
    try {
        return await authAdmin.verifyIdToken(token);
    } catch (e) {
        throw errorHttp("Token inválido o expirado", 401);
    }
}

function esAdmin(claims) {
    const email = (claims.email || "").toLowerCase();
    return claims.admin === true || EMAILS_ADMIN.includes(email);
}

/* ---------- Endpoints ---------- */

exports.api = onRequest(async (req, res) => {
    if (configurarCors(req, res)) return; // preflight

    try {
        if (req.method === "GET" && req.path === "/salud") {
            escribirJson(res, 200, { ok: true, servicio: "panaderia-api" });
            return;
        }

        const claims = await verificarToken(req);

        if (req.method === "POST" && req.path === "/ventas") {
            await crearVenta(req.body, claims, res);
            return;
        }

        if (req.method === "DELETE" && req.path.startsWith("/ventas/")) {
            if (!esAdmin(claims)) throw errorHttp("Requiere rol de administrador", 403);
            const id = req.path.split("/").pop();
            await db.collection("ventas").doc(id).delete();
            escribirJson(res, 200, { ok: true });
            return;
        }

        if (req.method === "POST" && req.path === "/clientes") {
            await crearCliente(req.body, claims, res);
            return;
        }

        if (req.method === "POST" && req.path === "/adelantos") {
            await crearMovimientoPersonal(req.body, claims, "adelantos", res);
            return;
        }

        if (req.method === "POST" && req.path === "/pagos") {
            await crearMovimientoPersonal(req.body, claims, "pagos_personal", res);
            return;
        }

        error(res, 404, "Ruta no encontrada");
    } catch (e) {
        const codigo = Number.isInteger(e.codigo) ? e.codigo : 500;
        if (codigo >= 500) console.error("Error en API:", e);
        error(res, codigo, e.message || "Error interno del servidor");
    }
});

async function crearVenta(body, claims, res) {
    const cliente = limpiarTexto(body.cliente, LIMITES.TEXTO);
    const estadoPago = ESTADOS_PAGO.includes(body.estadoPago) ? body.estadoPago : null;
    const totalVenta = validarMonto(body.totalVenta, "totalVenta");
    const cantidadFundas = Number(body.cantidadFundas);
    const montoAbono = estadoPago === "abono" ? validarMonto(body.montoAbono, "montoAbono") : null;

    if (!cliente) throw errorHttp("cliente inválido", 400);
    if (!estadoPago) throw errorHttp("estadoPago inválido", 400);
    if (!Number.isInteger(cantidadFundas) || cantidadFundas < 0 || cantidadFundas > LIMITES.CANTIDAD_MAX) {
        throw errorHttp("cantidadFundas inválida", 400);
    }
    if (estadoPago === "abono" && montoAbono === null) {
        throw errorHttp("montoAbono inválido", 400);
    }

    const fecha = body.fecha ? new Date(body.fecha) : new Date();
    if (Number.isNaN(fecha.getTime())) throw errorHttp("fecha inválida", 400);

    const datos = {
        cliente,
        cantidadFundas,
        totalVenta,
        estadoPago,
        fecha: Timestamp.fromDate(fecha),
        creadoPor: claims.email || claims.uid
    };
    if (estadoPago === "abono") datos.montoAbono = montoAbono;

    const ref = await db.collection("ventas").add(datos);
    escribirJson(res, 201, { ok: true, id: ref.id });
}

async function crearCliente(body, claims, res) {
    const nombre = limpiarTexto(body.nombre, LIMITES.TEXTO);
    const telefono = limpiarTexto(body.telefono, 20).replace(/[^0-9+]/g, "").slice(0, 15);
    if (!nombre) throw errorHttp("nombre inválido", 400);

    const ref = await db.collection("clientes").add({
        nombre,
        nombreNorm: nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
        telefono,
        fechaRegistro: FieldValue.serverTimestamp(),
        creadoPor: claims.email || claims.uid
    });
    escribirJson(res, 201, { ok: true, id: ref.id });
}

async function crearMovimientoPersonal(body, claims, coleccion, res) {
    const trabajador = limpiarTexto(body.trabajador, 50);
    const concepto = limpiarTexto(body.concepto, LIMITES.CONCEPTO) || "Movimiento";
    const monto = validarMonto(body.monto, "monto");
    const dia = limpiarTexto(body.dia, 10);

    if (!trabajador) throw errorHttp("trabajador inválido", 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw errorHttp("dia inválido", 400);

    const ref = await db.collection(coleccion).add({
        trabajador,
        concepto,
        monto,
        dia,
        fecha: FieldValue.serverTimestamp(),
        creadoPor: claims.email || claims.uid
    });
    escribirJson(res, 201, { ok: true, id: ref.id });
}
