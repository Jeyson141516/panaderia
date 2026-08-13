import { db } from './firebase-config.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast, escapeHtml } from './ui.js';

const btnConsultar = document.getElementById('btnConsultar');
const btnPdf = document.getElementById('btnPdf');
const lblContado = document.getElementById('lblContado');
const lblCredito = document.getElementById('lblCredito');
const lblAbonos = document.getElementById('lblAbonos');
const lblPendiente = document.getElementById('lblPendiente');
const lblTotal = document.getElementById('lblTotal');
const listaMejoresClientes = document.getElementById('listaMejoresClientes');
const infoGrafico1 = document.getElementById('infoGrafico1');

const lblResVentas = document.getElementById('lblResVentas');
const lblResGastos = document.getElementById('lblResGastos');
const lblResPersonal = document.getElementById('lblResPersonal');
const lblResPersonalDetalle = document.getElementById('lblResPersonalDetalle');
const lblResUtilidad = document.getElementById('lblResUtilidad');

const btnCsv = document.getElementById('btnCsv');
const tablaPagosTrabajadores = document.getElementById('tablaPagosTrabajadores');

const fechaInicioInput = document.getElementById('fechaInicio');
const fechaFinInput = document.getElementById('fechaFin');
const estadoFiltro = document.getElementById('estadoFiltro');
const periodoFiltro = document.getElementById('periodoFiltro');

let ultimoReporte = null;

function fechaISO(d) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

window.addEventListener('DOMContentLoaded', () => {
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    fechaInicioInput.value = fechaISO(primerDia);
    fechaFinInput.value = fechaISO(hoy);

    cargarReporte();
});

btnConsultar.addEventListener('click', cargarReporte);

function bloquearFechas(bloqueado) {
    fechaInicioInput.disabled = bloqueado;
    fechaFinInput.disabled = bloqueado;
}

periodoFiltro.addEventListener('change', () => {
    const hoy = new Date();

    if (periodoFiltro.value === 'hoy') {
        fechaInicioInput.value = fechaISO(hoy);
        fechaFinInput.value = fechaISO(hoy);
        bloquearFechas(true);
    } else {
        bloquearFechas(false);

        if (periodoFiltro.value === 'semana') {
            const diasDesdeLunes = (hoy.getDay() + 6) % 7;
            const lunes = new Date(hoy);
            lunes.setDate(hoy.getDate() - diasDesdeLunes);
            fechaInicioInput.value = fechaISO(lunes);
            fechaFinInput.value = fechaISO(hoy);
        } else if (periodoFiltro.value === 'mes') {
            const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            fechaInicioInput.value = fechaISO(primerDia);
            fechaFinInput.value = fechaISO(hoy);
        }
    }

    cargarReporte();
});

function rangoFechas() {
    const condiciones = [];
    const inicio = fechaInicioInput.value;
    const fin = fechaFinInput.value;

    if (inicio) {
        condiciones.push(where("fecha", ">=", new Date(`${inicio}T00:00:00`)));
    }
    if (fin) {
        condiciones.push(where("fecha", "<=", new Date(`${fin}T23:59:59.999`)));
    }

    return condiciones;
}

function construirQuery() {
    const condiciones = rangoFechas();
    condiciones.push(orderBy("fecha", "desc"));
    return query(collection(db, "ventas"), ...condiciones);
}

function formatearMoneda(valor) {
    return `$${Number(valor).toFixed(2)}`;
}

async function cargarReporte() {
    btnConsultar.disabled = true;

    try {
        const [querySnapshot, gastosSnap, adelantosSnap, pagosSnap] = await Promise.all([
            getDocs(construirQuery()),
            getDocs(query(collection(db, "gastos_inventario"), ...rangoFechas(), orderBy("fecha", "desc"))),
            getDocs(query(collection(db, "adelantos"), ...rangoFechas(), orderBy("fecha", "desc"))),
            getDocs(query(collection(db, "pagos_personal"), ...rangoFechas(), orderBy("fecha", "desc")))
        ]);

        let totalVentas = 0;
        let totalContado = 0;
        let totalCredito = 0;
        let totalAbonos = 0;
        let totalFundas = 0;
        let clientesMap = {};

        querySnapshot.forEach((docSnap) => {
            const venta = docSnap.data();
            const monto = Number(venta.totalVenta) || 0;
            const estado = venta.estadoPago || "pagado";
            const fundas = Number(venta.cantidadFundas) || 0;

            totalVentas += monto;

            if (estadoFiltro.value === "todos" || estado === estadoFiltro.value) {
                totalFundas += fundas;

                if (estado === 'pagado') {
                    totalContado += monto;
                } else if (estado === 'debe') {
                    totalCredito += monto;
                } else if (estado === 'abono') {
                    totalAbonos += monto;
                }

                const cliente = venta.cliente || "Cliente General";
                clientesMap[cliente] = (clientesMap[cliente] || 0) + fundas;
            }
        });

        let totalGastos = 0;
        gastosSnap.forEach((docSnap) => {
            totalGastos += Number(docSnap.data().monto) || 0;
        });

        let totalAdelantos = 0;
        adelantosSnap.forEach((docSnap) => {
            totalAdelantos += Number(docSnap.data().monto) || 0;
        });

        let totalPagosPersonal = 0;
        pagosSnap.forEach((docSnap) => {
            totalPagosPersonal += Number(docSnap.data().monto) || 0;
        });

        const pagosTrabajadores = construirPagosTrabajadores(adelantosSnap, pagosSnap);
        const totalAPagar = totalPagosPersonal - totalAdelantos;
        const utilidadNeta = totalVentas - totalGastos - totalAPagar;

        const totalFacturado = totalContado + totalCredito;
        const totalPendiente = Math.max(0, totalCredito - totalAbonos);

        ultimoReporte = {
            fechaInicio: fechaInicioInput.value,
            fechaFin: fechaFinInput.value,
            estado: estadoFiltro.value,
            periodo: periodoFiltro.value,
            totalContado,
            totalCredito,
            totalAbonos,
            totalPendiente,
            totalFacturado,
            totalFundas,
            totalVentas,
            totalGastos,
            totalAdelantos,
            totalPagosPersonal,
            totalAPagar,
            utilidadNeta,
            pagosTrabajadores,
            clientes: Object.entries(clientesMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
        };

        lblResVentas.textContent = formatearMoneda(totalVentas);
        lblResGastos.textContent = formatearMoneda(totalGastos);
        lblResPersonal.textContent = formatearMoneda(totalAPagar);
        lblResPersonalDetalle.textContent = `Salario Total: ${formatearMoneda(totalPagosPersonal)} · Adelantos: ${formatearMoneda(totalAdelantos)}`;
        lblResUtilidad.textContent = formatearMoneda(utilidadNeta);
        lblResUtilidad.style.color = utilidadNeta >= 0 ? "var(--success)" : "var(--danger)";

        renderPagosTrabajadores(pagosTrabajadores);

        lblContado.textContent = formatearMoneda(totalContado);
        lblCredito.textContent = formatearMoneda(totalCredito);
        lblAbonos.textContent = formatearMoneda(totalAbonos);
        lblPendiente.textContent = formatearMoneda(totalPendiente);
        lblTotal.textContent = formatearMoneda(totalFacturado);

        infoGrafico1.innerHTML = `
            Contado: <b>${formatearMoneda(totalContado)}</b><br>
            Fiado/Crédito: <b>${formatearMoneda(totalCredito)}</b><br>
            Abonos recibidos: <b>${formatearMoneda(totalAbonos)}</b><br>
            Fundas vendidas: <b>${totalFundas}</b>`;
        infoGrafico1.classList.remove('empty-state');

        if (ultimoReporte.clientes.length > 0) {
            listaMejoresClientes.innerHTML = '<ul class="client-list">' +
                ultimoReporte.clientes.map(([cli, fundas], index) => `
                    <li>
                        <span><span class="rank">${index + 1}</span>${escapeHtml(cli)}</span>
                        <span class="amount">${fundas} fundas</span>
                    </li>
                `).join('') + '</ul>';
        } else {
            listaMejoresClientes.innerHTML = '<p class="empty-state">Sin datos en el rango seleccionado.</p>';
        }
    } catch (error) {
        console.error("Error al cargar reportes:", error);
        toast("Hubo un error al generar el reporte.", "error");
    } finally {
        btnConsultar.disabled = false;
    }
}

function construirPagosTrabajadores(adelantosSnap, pagosSnap) {
    const mapa = new Map();

    function acumular(docSnap, esAdelanto) {
        const d = docSnap.data();
        const nombre = d.trabajador || "Sin asignar";
        const monto = Number(d.monto) || 0;

        if (!mapa.has(nombre)) {
            mapa.set(nombre, { trabajador: nombre, salarioTotal: 0, adelantos: 0, totalPagar: 0 });
        }

        const fila = mapa.get(nombre);
        if (esAdelanto) {
            fila.adelantos += monto;
        } else {
            fila.salarioTotal += monto;
        }
    }

    adelantosSnap.forEach((docSnap) => acumular(docSnap, true));
    pagosSnap.forEach((docSnap) => acumular(docSnap, false));

    return [...mapa.values()]
        .map((f) => ({ ...f, totalPagar: f.salarioTotal - f.adelantos }))
        .sort((a, b) => a.trabajador.localeCompare(b.trabajador, "es"));
}

function renderPagosTrabajadores(filas) {
    if (filas.length === 0) {
        tablaPagosTrabajadores.innerHTML = '<tr><td colspan="4" class="empty-cell">No hay pagos ni adelantos en el período.</td></tr>';
        return;
    }

    tablaPagosTrabajadores.innerHTML = filas.map((f) => `
        <tr>
            <td>${escapeHtml(f.trabajador)}</td>
            <td class="monto-cell">${formatearMoneda(f.salarioTotal)}</td>
            <td class="monto-cell">${formatearMoneda(f.adelantos)}</td>
            <td class="monto-cell"><b style="color: ${f.totalPagar >= 0 ? "var(--success)" : "var(--danger)"};">${formatearMoneda(f.totalPagar)}</b></td>
        </tr>`).join("");
}

function descargarCsv() {
    if (!ultimoReporte) {
        toast("Primero genera el reporte.", "warning");
        return;
    }

    const filas = ultimoReporte.pagosTrabajadores;

    if (filas.length === 0) {
        toast("No hay datos de personal para exportar.", "warning");
        return;
    }

    const escapar = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const encabezado = ["Trabajador", "Salario Total", "Adelantos", "Total a Pagar"];
    const lineas = filas.map((f) => [
        escapar(f.trabajador),
        f.salarioTotal.toFixed(2),
        f.adelantos.toFixed(2),
        f.totalPagar.toFixed(2)
    ].join(","));

    const csv = [encabezado.join(","), ...lineas].join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `pagos-trabajadores-${fechaInicioInput.value || "inicio"}-a-${fechaFinInput.value || "hoy"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast("CSV exportado correctamente.");
}

btnCsv.addEventListener('click', descargarCsv);

function abrirVentanaImpresion() {
    if (!ultimoReporte) {
        toast("Primero genera el reporte.", "warning");
        return;
    }

    const r = ultimoReporte;
    const etiquetaPeriodo = r.periodo === 'hoy' ? 'Hoy' : r.periodo === 'semana' ? 'Semana' : r.periodo === 'mes' ? 'Mes' : 'Personalizado';
    const clientesHtml = r.clientes.length > 0
        ? r.clientes.map(([cli, fundas], index) =>
            `<tr><td>${index + 1}</td><td>${escapeHtml(cli)}</td><td style="text-align:right">${fundas} fundas</td></tr>`).join('')
        : '<tr><td colspan="3" style="text-align:center;color:#888;">Sin datos</td></tr>';

    const pagosTrabajadoresHtml = r.pagosTrabajadores.length > 0
        ? r.pagosTrabajadores.map((f) =>
            `<tr><td>${escapeHtml(f.trabajador)}</td><td style="text-align:right">${formatearMoneda(f.salarioTotal)}</td><td style="text-align:right">${formatearMoneda(f.adelantos)}</td><td style="text-align:right"><b>${formatearMoneda(f.totalPagar)}</b></td></tr>`).join('')
        : '<tr><td colspan="4" style="text-align:center;color:#888;">Sin datos</td></tr>';

    const ventana = window.open('', '_blank', 'width=800,height=600');
    ventana.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Reporte Financiero - Panadería Familiar</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; padding: 32px; }
                h1 { font-size: 22px; margin: 0 0 4px; }
                .sub { color: #6b7280; margin-bottom: 24px; }
                table { width: 100%; border-collapse: collapse; margin-top: 18px; }
                th, td { border-bottom: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; }
                th { background: #f3f4f6; }
                .grid { display: flex; gap: 16px; flex-wrap: wrap; }
                .box { flex: 1; min-width: 150px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; text-align: center; }
                .box b { display: block; font-size: 20px; margin-top: 4px; }
                .box .lbl { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
                .utilidad { background: #ecfdf5; border-color: #6ee7b7; }
                .utilidad.negativa { background: #fef2f2; border-color: #fca5a5; }
            </style>
        </head>
        <body>
            <h1>Reporte Financiero — Panadería Familiar</h1>
            <div class="sub">Período: ${etiquetaPeriodo} · ${r.fechaInicio || 'inicio'} a ${r.fechaFin || 'hoy'} · Estado: ${r.estado}</div>
            <h2 style="font-size:16px;">💰 Resumen Financiero</h2>
            <div class="grid">
                <div class="box"><span class="lbl">Ventas (Ingresos)</span><b>${formatearMoneda(r.totalVentas)}</b></div>
                <div class="box"><span class="lbl">Gastos (Insumos)</span><b>${formatearMoneda(r.totalGastos)}</b></div>
                <div class="box"><span class="lbl">Total a Pagar a Personal</span><b>${formatearMoneda(r.totalAPagar)}</b></div>
                <div class="box ${r.utilidadNeta >= 0 ? 'utilidad' : 'utilidad negativa'}"><span class="lbl">Utilidad Neta</span><b>${formatearMoneda(r.utilidadNeta)}</b></div>
            </div>
            <p style="margin-top: 12px; color: #6b7280; font-size: 13px;">
                Detalle Personal — Salario Total: <b>${formatearMoneda(r.totalPagosPersonal)}</b> · Adelantos: <b>${formatearMoneda(r.totalAdelantos)}</b>
            </p>
            <h2 style="font-size:16px;margin-top:28px;">👥 Pagos por Trabajador (Total a Pagar = Salario − Adelantos)</h2>
            <table>
                <thead><tr><th>Trabajador</th><th style="text-align:right">Salario Total</th><th style="text-align:right">Adelantos</th><th style="text-align:right">Total a Pagar</th></tr></thead>
                <tbody>${pagosTrabajadoresHtml}</tbody>
            </table>
            <h2 style="font-size:16px;margin-top:28px;">📅 Detalle de Ventas</h2>
            <div class="grid">
                <div class="box">Contado<b>${formatearMoneda(r.totalContado)}</b></div>
                <div class="box">Fiado / Crédito<b>${formatearMoneda(r.totalCredito)}</b></div>
                <div class="box">Abonos recibidos<b>${formatearMoneda(r.totalAbonos)}</b></div>
                <div class="box">Pendiente de cobro<b>${formatearMoneda(r.totalPendiente)}</b></div>
                <div class="box">Total Facturado<b>${formatearMoneda(r.totalFacturado)}</b></div>
                <div class="box">Fundas vendidas<b>${r.totalFundas}</b></div>
            </div>
            <h2 style="font-size:16px;margin-top:28px;">🏆 Mejores Clientes</h2>
            <table>
                <thead><tr><th>#</th><th>Cliente</th><th>Fundas</th></tr></thead>
                <tbody>${clientesHtml}</tbody>
            </table>
            <p style="margin-top: 28px; color: #9ca3af; font-size: 12px;">Generado el ${new Date().toLocaleString('es-EC')}</p>
        </body>
        </html>
    `);
    ventana.document.close();
    ventana.focus();
    setTimeout(() => ventana.print(), 350);
}

btnPdf.addEventListener('click', abrirVentanaImpresion);
