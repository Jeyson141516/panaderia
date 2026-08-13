import { db } from './firebase-config.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast, escapeHtml } from './ui.js';

const btnConsultar = document.getElementById('btnConsultar');
const btnPdf = document.getElementById('btnPdf');
const lblContado = document.getElementById('lblContado');
const lblCredito = document.getElementById('lblCredito');
const lblPendiente = document.getElementById('lblPendiente');
const lblTotal = document.getElementById('lblTotal');
const listaMejoresClientes = document.getElementById('listaMejoresClientes');
const infoGrafico1 = document.getElementById('infoGrafico1');

const fechaInicioInput = document.getElementById('fechaInicio');
const fechaFinInput = document.getElementById('fechaFin');
const estadoFiltro = document.getElementById('estadoFiltro');

let ultimoReporte = null;

window.addEventListener('DOMContentLoaded', () => {
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
    const hoyStr = hoy.toISOString().split('T')[0];

    fechaInicioInput.value = primerDia;
    fechaFinInput.value = hoyStr;

    cargarReporte();
});

btnConsultar.addEventListener('click', cargarReporte);

function construirQuery() {
    const condiciones = [];
    const inicio = fechaInicioInput.value;
    const fin = fechaFinInput.value;
    const estado = estadoFiltro.value;

    if (inicio) {
        condiciones.push(where("fecha", ">=", new Date(`${inicio}T00:00:00`)));
    }
    if (fin) {
        condiciones.push(where("fecha", "<=", new Date(`${fin}T23:59:59.999`)));
    }
    if (estado !== "todos") {
        condiciones.push(where("estadoPago", "==", estado));
    }

    condiciones.push(orderBy("fecha", "desc"));

    return query(collection(db, "ventas"), ...condiciones);
}

function formatearMoneda(valor) {
    return `$${Number(valor).toFixed(2)}`;
}

async function cargarReporte() {
    btnConsultar.disabled = true;

    try {
        const querySnapshot = await getDocs(construirQuery());

        let totalContado = 0;
        let totalCredito = 0;
        let totalFundas = 0;
        let clientesMap = {};

        querySnapshot.forEach((docSnap) => {
            const venta = docSnap.data();
            const monto = Number(venta.totalVenta) || 0;
            const cliente = venta.cliente || "Cliente General";
            const estado = venta.estadoPago || "pagado";
            const fundas = Number(venta.cantidadFundas) || 0;

            totalFundas += fundas;

            if (estado === 'pagado') {
                totalContado += monto;
            } else if (estado === 'debe') {
                totalCredito += monto;
            }

            clientesMap[cliente] = (clientesMap[cliente] || 0) + fundas;
        });

        const totalFacturado = totalContado + totalCredito;

        ultimoReporte = {
            fechaInicio: fechaInicioInput.value,
            fechaFin: fechaFinInput.value,
            estado: estadoFiltro.value,
            totalContado,
            totalCredito,
            totalPendiente: totalCredito,
            totalFacturado,
            totalFundas,
            clientes: Object.entries(clientesMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
        };

        lblContado.textContent = formatearMoneda(totalContado);
        lblCredito.textContent = formatearMoneda(totalCredito);
        lblPendiente.textContent = formatearMoneda(totalCredito);
        lblTotal.textContent = formatearMoneda(totalFacturado);

        infoGrafico1.innerHTML = `
            Contado: <b>${formatearMoneda(totalContado)}</b><br>
            Fiado/Crédito: <b>${formatearMoneda(totalCredito)}</b><br>
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

function abrirVentanaImpresion() {
    if (!ultimoReporte) {
        toast("Primero genera el reporte.", "warning");
        return;
    }

    const r = ultimoReporte;
    const clientesHtml = r.clientes.length > 0
        ? r.clientes.map(([cli, fundas], index) =>
            `<tr><td>${index + 1}</td><td>${escapeHtml(cli)}</td><td style="text-align:right">${fundas} fundas</td></tr>`).join('')
        : '<tr><td colspan="3" style="text-align:center;color:#888;">Sin datos</td></tr>';

    const ventana = window.open('', '_blank', 'width=800,height=600');
    ventana.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Reporte de Ventas - Panadería Familiar</title>
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
            </style>
        </head>
        <body>
            <h1>Reporte de Ventas — Panadería Familiar</h1>
            <div class="sub">Período: ${r.fechaInicio || 'inicio'} a ${r.fechaFin || 'hoy'} · Estado: ${r.estado}</div>
            <div class="grid">
                <div class="box">Contado<b>${formatearMoneda(r.totalContado)}</b></div>
                <div class="box">Fiado / Crédito<b>${formatearMoneda(r.totalCredito)}</b></div>
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
