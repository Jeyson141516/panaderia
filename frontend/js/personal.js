import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast, escapeHtml } from './ui.js';
import { limpiarTexto, validarMonto } from './utils.js';

const TRABAJADORES = ["Patucho", "Lucho", "Flaquito"];
const COL_ADELANTOS = "adelantos";
const COL_PAGOS = "pagos_personal";

const formMovimiento = document.getElementById('formMovimiento');
const resumenPersonal = document.getElementById('resumenPersonal');
const tablaMovimientos = document.getElementById('tablaMovimientos');

const reporteTrabajador = document.getElementById('reportTrabajador');
const reporteInicio = document.getElementById('reportInicio');
const reporteFin = document.getElementById('reportFin');
const btnFiltrarReporte = document.getElementById('btnFiltrarReporte');
const btnImprimirReporte = document.getElementById('btnImprimirReporte');
const reporteTotales = document.getElementById('reporteTotales');
const tablaReporte = document.getElementById('tablaReporte');

let todosMovimientos = [];
let reporteActual = [];

function formatearMoneda(valor) {
    return `$${Number(valor).toFixed(2)}`;
}

function fechaHoy() {
    const hoy = new Date();
    const dd = String(hoy.getDate()).padStart(2, '0');
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    return `${hoy.getFullYear()}-${mm}-${dd}`;
}

function inicioSemana() {
    const hoy = new Date();
    const diasDesdeLunes = (hoy.getDay() + 6) % 7;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diasDesdeLunes);
    const dd = String(lunes.getDate()).padStart(2, '0');
    const mm = String(lunes.getMonth() + 1).padStart(2, '0');
    return `${lunes.getFullYear()}-${mm}-${dd}`;
}

function diaDeMovimiento(fecha) {
    if (!fecha) return "";
    if (fecha.toDate) {
        const d = fecha.toDate();
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${d.getFullYear()}-${mm}-${dd}`;
    }
    if (typeof fecha === 'string') return fecha.slice(0, 10);
    return "";
}

function valorFecha(fecha) {
    if (!fecha) return 0;
    if (fecha.toDate) return fecha.toDate().getTime();
    if (fecha instanceof Date) return fecha.getTime();
    if (typeof fecha === 'string') return Date.parse(fecha) || 0;
    return 0;
}

function formatearFecha(fecha) {
    if (!fecha) return "—";
    if (fecha.toDate) return fecha.toDate().toLocaleDateString("es-EC");
    if (fecha instanceof Date) return fecha.toLocaleDateString("es-EC");
    if (typeof fecha === "string") return fecha;
    return String(fecha);
}

async function cargarMovimientos() {
    try {
        const [adelantosSnap, pagosSnap] = await Promise.all([
            getDocs(query(collection(db, COL_ADELANTOS), orderBy("fecha", "desc"))),
            getDocs(query(collection(db, COL_PAGOS), orderBy("fecha", "desc")))
        ]);

        const movimientos = [];

        adelantosSnap.forEach((docSnap) => {
            const d = docSnap.data();
            movimientos.push({
                fecha: d.dia || d.fecha,
                trabajador: d.trabajador || "Sin asignar",
                tipo: "adelanto",
                concepto: d.concepto || "Adelanto",
                monto: Number(d.monto) || 0
            });
        });

        pagosSnap.forEach((docSnap) => {
            const d = docSnap.data();
            movimientos.push({
                fecha: d.dia || d.fecha,
                trabajador: d.trabajador || "Sin asignar",
                tipo: "pago",
                concepto: d.concepto || "Pago de jornal",
                monto: Number(d.monto) || 0
            });
        });

        movimientos.sort((a, b) => valorFecha(b.fecha) - valorFecha(a.fecha));

        todosMovimientos = movimientos;
        renderResumen(movimientos);
        renderTabla(movimientos.slice(0, 50));
        aplicarFiltroReporte();
    } catch (error) {
        console.error("Error cargando movimientos:", error);
        tablaMovimientos.innerHTML = '<tr><td colspan="5" class="empty-cell">No se pudo cargar el historial.</td></tr>';
        toast("Hubo un error al cargar el historial.", "error");
    }
}

function renderResumen(movimientos) {
    resumenPersonal.innerHTML = TRABAJADORES.map((nombre) => {
        const delTrabajador = movimientos.filter((mv) => mv.trabajador === nombre);
        const adelantos = delTrabajador.filter((x) => x.tipo === "adelanto").reduce((s, x) => s + x.monto, 0);
        const pagos = delTrabajador.filter((x) => x.tipo === "pago").reduce((s, x) => s + x.monto, 0);
        const balance = pagos - adelantos;

        return `
            <div class="summary-card">
                <h4>${escapeHtml(nombre)}</h4>
                <div class="personal-summary">
                    <div class="ps-item">
                        <span>Adelantos (semana)</span>
                        <b style="color: var(--warning);">${formatearMoneda(adelantos)}</b>
                    </div>
                    <div class="ps-item">
                        <span>Pagos de jornal/semana</span>
                        <b style="color: var(--success);">${formatearMoneda(pagos)}</b>
                    </div>
                    <div class="ps-item">
                        <span>Balance (pagos − adelantos)</span>
                        <b style="color: ${balance >= 0 ? "var(--success)" : "var(--danger)"};">${formatearMoneda(balance)}</b>
                    </div>
                </div>
            </div>`;
    }).join("");
}

function filasMovimientosHTML(movimientos) {
    return movimientos.map((mv) => `
        <tr>
            <td>${formatearFecha(mv.fecha)}</td>
            <td>${escapeHtml(mv.trabajador)}</td>
            <td><span class="badge ${mv.tipo}">${mv.tipo === "adelanto" ? "Adelanto" : "Pago"}</span></td>
            <td>${escapeHtml(mv.concepto || "—")}</td>
            <td class="monto-cell ${mv.tipo}">${mv.tipo === "adelanto" ? "−" : "+"}${formatearMoneda(mv.monto)}</td>
        </tr>`).join("");
}

function renderTabla(movimientos) {
    if (movimientos.length === 0) {
        tablaMovimientos.innerHTML = '<tr><td colspan="5" class="empty-cell">Aún no hay movimientos registrados.</td></tr>';
        return;
    }

    tablaMovimientos.innerHTML = filasMovimientosHTML(movimientos);
}

function resumenDe(lista, nombre) {
    const del = lista.filter((mv) => mv.trabajador === nombre);
    const adelantos = del.filter((x) => x.tipo === "adelanto").reduce((s, x) => s + x.monto, 0);
    const pagos = del.filter((x) => x.tipo === "pago").reduce((s, x) => s + x.monto, 0);
    return { movimientos: del.length, adelantos, pagos, balance: pagos - adelantos };
}

function aplicarFiltroReporte() {
    const seleccion = reporteTrabajador.value;
    const inicio = reporteInicio.value;
    const fin = reporteFin.value;

    let filtrados = todosMovimientos;

    if (seleccion !== "todos") {
        filtrados = filtrados.filter((mv) => mv.trabajador === seleccion);
    }

    if (inicio || fin) {
        filtrados = filtrados.filter((mv) => {
            const dia = diaDeMovimiento(mv.fecha);
            if (!dia) return false;
            if (inicio && dia < inicio) return false;
            if (fin && dia > fin) return false;
            return true;
        });
    }

    filtrados = filtrados.slice().sort((a, b) => valorFecha(b.fecha) - valorFecha(a.fecha));

    reporteActual = filtrados;
    renderReporteTotales(filtrados, seleccion);
    renderReporteTabla(filtrados);
}

function renderReporteTotales(filtrados, seleccion) {
    const nombres = seleccion === "todos" ? TRABAJADORES : [seleccion];
    const conDatos = nombres.filter((n) => filtrados.some((mv) => mv.trabajador === n));

    if (conDatos.length === 0) {
        reporteTotales.innerHTML = '<div class="report-empty">No hay movimientos en este período.</div>';
        return;
    }

    reporteTotales.innerHTML = conDatos.map((nombre) => {
        const r = resumenDe(filtrados, nombre);
        return `
            <div class="report-card">
                <h4>${escapeHtml(nombre)}</h4>
                <div class="personal-summary">
                    <div class="ps-item">
                        <span>Movimientos</span>
                        <b>${r.movimientos}</b>
                    </div>
                    <div class="ps-item">
                        <span>Adelantos del período</span>
                        <b style="color: var(--warning);">${formatearMoneda(r.adelantos)}</b>
                    </div>
                    <div class="ps-item">
                        <span>Salario Total</span>
                        <b style="color: var(--success);">${formatearMoneda(r.pagos)}</b>
                    </div>
                    <div class="ps-item">
                        <span>Total a Pagar</span>
                        <b style="color: ${r.balance >= 0 ? "var(--success)" : "var(--danger)"};">${formatearMoneda(r.balance)}</b>
                    </div>
                </div>
            </div>`;
    }).join("");
}

function renderReporteTabla(filtrados) {
    if (filtrados.length === 0) {
        tablaReporte.innerHTML = '<tr><td colspan="5" class="empty-cell">No hay movimientos con los filtros seleccionados.</td></tr>';
        return;
    }

    tablaReporte.innerHTML = filasMovimientosHTML(filtrados);
}

formMovimiento.addEventListener('submit', async (e) => {
    e.preventDefault();

    const trabajador = document.getElementById('trabajador').value;
    const tipo = document.getElementById('tipoMovimiento').value;
    const concepto = limpiarTexto(document.getElementById('concepto').value, 120);
    const monto = validarMonto(document.getElementById('montoPersonal').value, 0.01, 1000000);
    const dia = limpiarTexto(document.getElementById('diaMovimiento').value, 10);

    if (!TRABAJADORES.includes(trabajador)) {
        toast("Selecciona un trabajador válido.", "warning");
        return;
    }

    if (monto === null) {
        toast("Ingresa un monto válido mayor a 0.", "warning");
        return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
        toast("Selecciona la fecha del movimiento.", "warning");
        return;
    }

    try {
        const coleccion = tipo === "adelanto" ? COL_ADELANTOS : COL_PAGOS;

        await addDoc(collection(db, coleccion), {
            trabajador,
            monto,
            concepto: concepto || (tipo === "adelanto" ? "Adelanto" : "Pago de jornal"),
            dia,
            fecha: serverTimestamp()
        });

        const etiqueta = tipo === "adelanto" ? "adelanto" : "pago";
        toast(`¡${etiqueta} de $${monto.toFixed(2)} registrado para ${trabajador}!`);

        formMovimiento.reset();
        document.getElementById('diaMovimiento').value = fechaHoy();
        cargarMovimientos();
    } catch (error) {
        console.error("Error al guardar movimiento: ", error);
        toast("Hubo un error al guardar el movimiento.", "error");
    }
});

function imprimirReporte() {
    if (reporteActual.length === 0) {
        toast("No hay movimientos para imprimir. Ajusta el filtro.", "warning");
        return;
    }

    const seleccion = reporteTrabajador.value;
    const etiquetaTrabajador = seleccion === "todos" ? "Todos los empleados" : seleccion;
    const periodo = `${reporteInicio.value || "inicio"} a ${reporteFin.value || "hoy"}`;
    const nombres = seleccion === "todos" ? TRABAJADORES : [seleccion];

    const resumenHtml = nombres
        .filter((n) => reporteActual.some((mv) => mv.trabajador === n))
        .map((nombre) => {
            const r = resumenDe(reporteActual, nombre);
            return `
            <tr>
                <td>${escapeHtml(nombre)}</td>
                <td style="text-align:right">${r.movimientos}</td>
                <td style="text-align:right">${formatearMoneda(r.adelantos)}</td>
                <td style="text-align:right">${formatearMoneda(r.pagos)}</td>
                <td style="text-align:right"><b>${formatearMoneda(r.balance)}</b></td>
            </tr>`;
        }).join("");

    const filas = filasMovimientosHTML(reporteActual);

    const ventana = window.open('', '_blank', 'width=900,height=700');
    ventana.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Reporte de Empleados - Panadería Familiar</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; padding: 32px; }
                h1 { font-size: 22px; margin: 0 0 4px; }
                .sub { color: #6b7280; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 14px; }
                th, td { border-bottom: 1px solid #e5e7eb; padding: 9px 8px; text-align: left; }
                th { background: #f3f4f6; }
                h2 { font-size: 16px; margin-top: 26px; }
                .badge { padding: 2px 8px; border-radius: 999px; font-size: 12px; }
                .badge.adelanto { background: #fef3c7; color: #b45309; }
                .badge.pago { background: #dcfce7; color: #15803d; }
                .neg { color: #dc2626; }
                .pos { color: #16a34a; }
            </style>
        </head>
        <body>
            <h1>Reporte de Empleados — Panadería Familiar</h1>
            <div class="sub">Trabajador: ${etiquetaTrabajador} · Período: ${periodo}</div>

            <h2>💰 Balance por trabajador</h2>
            <table>
                <thead><tr><th>Trabajador</th><th style="text-align:right">Mov.</th><th style="text-align:right">Adelantos</th><th style="text-align:right">Salario Total</th><th style="text-align:right">Total a Pagar</th></tr></thead>
                <tbody>${resumenHtml}</tbody>
            </table>

            <h2>📋 Detalle de movimientos</h2>
            <table>
                <thead><tr><th>Fecha</th><th>Trabajador</th><th>Tipo</th><th>Concepto</th><th style="text-align:right">Monto</th></tr></thead>
                <tbody>${filas}</tbody>
            </table>

            <p style="margin-top: 28px; color: #9ca3af; font-size: 12px;">Generado el ${new Date().toLocaleString('es-EC')}</p>
        </body>
        </html>
    `);
    ventana.document.close();
    ventana.focus();
    setTimeout(() => ventana.print(), 350);
}

document.getElementById('diaMovimiento').value = fechaHoy();
reporteInicio.value = inicioSemana();
reporteFin.value = fechaHoy();

btnFiltrarReporte.addEventListener('click', aplicarFiltroReporte);
btnImprimirReporte.addEventListener('click', imprimirReporte);
[reporteTrabajador, reporteInicio, reporteFin].forEach((el) => el.addEventListener('change', aplicarFiltroReporte));

cargarMovimientos();
