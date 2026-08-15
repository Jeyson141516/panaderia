import { db } from './firebase-config.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast, escapeHtml } from './ui.js';

const btnConsultar = document.getElementById('btnConsultar');
const btnPdf = document.getElementById('btnPdf');
const btnImprimir = document.getElementById('btnImprimir');
const lblContado = document.getElementById('lblContado');
const lblCredito = document.getElementById('lblCredito');
const lblAbonos = document.getElementById('lblAbonos');
const lblPendiente = document.getElementById('lblPendiente');
const lblTotal = document.getElementById('lblTotal');
const listaMejoresClientes = document.getElementById('listaMejoresClientes');
const infoGrafico1 = document.getElementById('infoGrafico1');

const lblResIngresosContado = document.getElementById('lblResIngresosContado');
const lblResGastos = document.getElementById('lblResGastos');
const lblResPersonal = document.getElementById('lblResPersonal');
const lblResPersonalDetalle = document.getElementById('lblResPersonalDetalle');
const lblResAdelantos = document.getElementById('lblResAdelantos');
const lblResUtilidad = document.getElementById('lblResUtilidad');

const btnCsv = document.getElementById('btnCsv');
const tablaPagosTrabajadores = document.getElementById('tablaPagosTrabajadores');
const tablaGastosPorProducto = document.getElementById('tablaGastosPorProducto');

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

        let totalContado = 0;
        let ingresosContado = 0;
        let totalCredito = 0;
        let totalAbonos = 0;
        let totalFundas = 0;
        let clientesMap = {};

        querySnapshot.forEach((docSnap) => {
            const venta = docSnap.data();
            const monto = Number(venta.totalVenta) || 0;
            const estado = venta.estadoPago || "pagado";
            const fundas = Number(venta.cantidadFundas) || 0;

            // Efectivo REAL recaudado de contado en el período. Se acumula sin
            // depender del filtro de estado porque alimenta exclusivamente la
            // fórmula de la utilidad neta (flujo de caja real del período).
            if (estado === 'pagado') {
                ingresosContado += monto;
            }

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

        const { total: totalGastos, items: gastosPorProducto } = agruparGastosPorProducto(gastosSnap);

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
        // Utilidad Neta = Ventas de Contado - Gastos (Insumos) - Total Adelantos Entregados.
        // Se basa EXCLUSIVAMENTE en el flujo de efectivo real del período: solo el
        // contado recaudado entra a la fórmula. Las ventas fiadas (crédito) y los
        // abonos NO la alteran, y los adelantos se descuentan como salida real de caja.
        const utilidadNeta = ingresosContado - totalGastos - totalAdelantos;

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
            ingresosContado,
            totalGastos,
            totalAdelantos,
            totalPagosPersonal,
            totalAPagar,
            utilidadNeta,
            gastosPorProducto,
            pagosTrabajadores,
            clientes: Object.entries(clientesMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
        };

        lblResIngresosContado.textContent = formatearMoneda(ingresosContado);
        lblResGastos.textContent = formatearMoneda(totalGastos);
        lblResPersonal.textContent = formatearMoneda(totalAPagar);
        lblResPersonalDetalle.textContent = `Salario Total: ${formatearMoneda(totalPagosPersonal)} · Adelantos: ${formatearMoneda(totalAdelantos)}`;
        lblResAdelantos.textContent = formatearMoneda(totalAdelantos);
        lblResUtilidad.textContent = formatearMoneda(utilidadNeta);
        lblResUtilidad.style.color = utilidadNeta >= 0 ? "var(--success)" : "var(--danger)";

        renderPagosTrabajadores(pagosTrabajadores);
        renderGastosPorProducto(gastosPorProducto);

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

function agruparGastosPorProducto(gastosSnap) {
    const mapa = new Map();
    let total = 0;

    gastosSnap.forEach((docSnap) => {
        const g = docSnap.data();
        const monto = Number(g.monto) || 0;
        const nombre = String(g.producto || g.descripcion || "Otros").trim() || "Otros";
        total += monto;
        mapa.set(nombre, (mapa.get(nombre) || 0) + monto);
    });

    const items = [...mapa.entries()]
        .map(([producto, totalInvertido]) => ({ producto, totalInvertido }))
        .sort((a, b) => b.totalInvertido - a.totalInvertido);

    return { total, items };
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

function renderGastosPorProducto(items) {
    if (items.length === 0) {
        tablaGastosPorProducto.innerHTML = '<tr><td colspan="2" class="empty-cell">No hay gastos registrados en el período.</td></tr>';
        return;
    }

    tablaGastosPorProducto.innerHTML = items.map((g) => `
        <tr>
            <td>${escapeHtml(g.producto)}</td>
            <td class="monto-cell">${formatearMoneda(g.totalInvertido)}</td>
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

function abrirVistaImpresion(accion) {
    if (!ultimoReporte) {
        toast("Primero genera el reporte.", "warning");
        return;
    }

    try {
        localStorage.setItem('panaderia:reporte-actual', JSON.stringify(ultimoReporte));
    } catch (e) {
        toast("No se pudo guardar el reporte. Intenta de nuevo.", "error");
        return;
    }

    window.open(`reporte-impresion.html?accion=${accion}`, '_blank');
}

btnImprimir.addEventListener('click', () => abrirVistaImpresion('imprimir'));

btnPdf.addEventListener('click', () => abrirVistaImpresion('descargar'));
