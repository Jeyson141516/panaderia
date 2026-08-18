import { db, getDocsSafe } from './firebase-config.js';
import { collection, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { auth } from './firebase-config.js';
import { normalizarTexto } from './utils.js';

let deudoresActual = { lista: [], total: 0, mapaNorm: {} };
let promesaEnCurso = null;

/**
 * Consulta las ventas con saldo (debe/abono) y calcula el saldo real por
 * cliente. Devuelve:
 *  - lista:   clientes con saldo > 0, ordenados de mayor a menor.
 *  - total:   cantidad de clientes con saldo pendiente.
 *  - mapaNorm: TODOS los clientes con movimiento (saldo >= 0) indexados por
 *    nombre normalizado, para mostrar estado "al día" en el autocompletado.
 */
export async function cargarDeudores() {
    if (promesaEnCurso) return promesaEnCurso;

    promesaEnCurso = (async () => {
        const snapshot = await getDocsSafe(
            query(collection(db, "ventas"),
                where("estadoPago", "in", ["debe", "abono"]))
        );

        const saldoPorCliente = new Map();
        snapshot.forEach((docSnap) => {
            const v = docSnap.data();
            const nombre = v.cliente || "Cliente General";
            const monto = Number(v.totalVenta) || 0;
            let saldo = saldoPorCliente.get(nombre) || 0;
            if (v.estadoPago === 'debe') {
                saldo += monto;
            } else {
                saldo -= monto;
            }
            saldoPorCliente.set(nombre, saldo);
        });

        const mapaNorm = {};
        const lista = [];
        saldoPorCliente.forEach((saldo, nombre) => {
            mapaNorm[normalizarTexto(nombre)] = { nombre, saldo };
            if (saldo > 0) {
                lista.push({ cliente: nombre, saldo });
            }
        });
        lista.sort((a, b) => b.saldo - a.saldo);

        deudoresActual = { lista, total: lista.length, mapaNorm };
        return deudoresActual;
    })();

    try {
        return await promesaEnCurso;
    } finally {
        promesaEnCurso = null;
    }
}

export function obtenerDeudores() {
    return deudoresActual;
}

export function actualizarBadgeVentas() {
    const badge = document.getElementById('navBadgeVentas');
    if (!badge) return;
    badge.textContent = deudoresActual.total > 0 ? String(deudoresActual.total) : '';
    badge.hidden = deudoresActual.total === 0;
}

const nombrePagina = (location.pathname.split("/").pop() || "index.html").toLowerCase();

// En index.html lo gestiona ventas.js (evita una consulta duplicada).
if (nombrePagina !== "index.html") {
    onAuthStateChanged(auth, (usuario) => {
        if (usuario && document.getElementById('navBadgeVentas')) {
            cargarDeudores().then(actualizarBadgeVentas).catch(() => {});
        }
    });
}
