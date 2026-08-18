import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast, escapeHtml } from './ui.js';
import { limpiarTexto, validarMonto, ejecutarConBotonBloqueado } from './utils.js';
import { renderizarReportePersonalHtml } from './personal-impresion-render.js';
import { imprimirEnVistaActual } from './impresion.js';

const TRABAJADORES = ["Patucho", "Lucho", "Flaquito"];
const COL_ADELANTOS = "adelantos";
const COL_PAGOS = "pagos_personal";
const CLAVE_REPORTE_PERSONAL = 'panaderia:reporte-personal-actual';

const formMovimiento = document.getElementById('formMovimiento');
const resumenPersonal = document.getElementById('resumenPersonal');
const tablaMovimientos = document.getElementById('tablaMovimientos');

const reporteTrabajador = document.getElementById('reportTrabajador');
const reporteInicio = document.getElementById('reportInicio');
const reporteFin = document.getElementById('reportFin');
const btnFiltrarReporte = document.getElementById('btnFiltrarReporte');
const btnImprimirReporte = document.getElementById('btnImprimirReporte');
const btnDescargarReporte = document.getElementById('btnDescargarReporte');
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

function finSemana() {
    const hoy = new Date();
    const diasDesdeLunes = (hoy.getDay() + 6) % 7;
    const domingo = new Date(hoy);
    domingo.setDate(hoy.getDate() + (6 - diasDesdeLunes));
    const dd = String(domingo.getDate()).padStart(2, '0');
    const mm = String(domingo.getMonth() + 1).padStart(2, '0');
    return `${domingo.getFullYear()}-${mm}-${dd}`;
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
    const inicio = inicioSemana();
    const fin = finSemana();

    const semana = movimientos.filter((mv) => {
        const dia = diaDeMovimiento(mv.fecha);
        return dia >= inicio && dia <= fin;
    });

    resumenPersonal.innerHTML = TRABAJADORES.map((nombre) => {
        const delTrabajador = semana.filter((mv) => mv.trabajador === nombre);
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

formMovimiento.addEventListener('submit', (e) => {
    e.preventDefault();

    ejecutarConBotonBloqueado(e.submitter, async () => {
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
                fecha: new Date()
            });
        } catch (error) {
            if (error.message !== 'timeout') {
                console.error("Error al guardar movimiento: ", error);
                toast("Hubo un error al guardar el movimiento.", "error");
                return;
            }
        }

        const etiqueta = tipo === "adelanto" ? "adelanto" : "pago";
        toast(`¡${etiqueta} de $${monto.toFixed(2)} registrado para ${trabajador}!`);

        formMovimiento.reset();
        document.getElementById('diaMovimiento').value = fechaHoy();
        cargarMovimientos().catch(() => {});
    });
});

function construirReportePersonal() {
    aplicarFiltroReporte();

    const seleccion = reporteTrabajador.value;
    const inicio = reporteInicio.value;
    const fin = reporteFin.value;
    const etiquetaTrabajador = seleccion === "todos" ? "Todos los empleados" : seleccion;
    const nombres = seleccion === "todos" ? TRABAJADORES : [seleccion];

    const resumenes = nombres
        .filter((n) => reporteActual.some((mv) => mv.trabajador === n))
        .map((nombre) => ({ nombre, ...resumenDe(reporteActual, nombre) }));

    const totalAdelantos = resumenes.reduce((s, r) => s + r.adelantos, 0);
    const totalPagos = resumenes.reduce((s, r) => s + r.pagos, 0);

    return {
        trabajador: seleccion,
        etiquetaTrabajador,
        inicio,
        fin,
        etiquetaPeriodo: `${inicio || "inicio"} a ${fin || "hoy"}`,
        resumenes,
        detalle: reporteActual.map((mv) => ({
            fechaTexto: formatearFecha(mv.fecha),
            trabajador: mv.trabajador,
            tipo: mv.tipo,
            concepto: mv.concepto,
            monto: mv.monto
        })),
        totalAdelantos,
        totalPagos,
        totalAPagar: totalPagos - totalAdelantos
    };
}

function abrirVistaImpresionPersonal(accion) {
    const reporte = construirReportePersonal();

    if (reporte.detalle.length === 0) {
        toast("No hay movimientos con los filtros seleccionados. Ajusta el filtro.", "warning");
        return;
    }

    try {
        localStorage.setItem(CLAVE_REPORTE_PERSONAL, JSON.stringify(reporte));
    } catch (error) {
        toast("No se pudo guardar el reporte. Intenta de nuevo.", "error");
        return;
    }

    if (accion === 'imprimir') {
        imprimirEnVistaActual(renderizarReportePersonalHtml(reporte));
        return;
    }

    window.open(`personal-impresion.html?accion=${accion}`, "_blank");
}

document.getElementById('diaMovimiento').value = fechaHoy();
reporteInicio.value = inicioSemana();
reporteFin.value = fechaHoy();

btnFiltrarReporte.addEventListener('click', aplicarFiltroReporte);
btnImprimirReporte.addEventListener('click', () => abrirVistaImpresionPersonal('imprimir'));
btnDescargarReporte.addEventListener('click', () => abrirVistaImpresionPersonal('descargar'));
[reporteTrabajador, reporteInicio, reporteFin].forEach((el) => el.addEventListener('change', aplicarFiltroReporte));

cargarMovimientos();
