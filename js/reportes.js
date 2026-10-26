import { db, getDocsSafe } from './firebase-config.js';
import { collection, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast, escapeHtml } from './ui.js';
import { renderizarReporteHtml } from './reporte-impresion-render.js';
import { imprimirEnVistaActual } from './impresion.js';

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
const insightsContainer = document.getElementById('insightsContainer');

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
    fechaInicioInput.value = fechaISO(hoy);
    fechaFinInput.value = fechaISO(hoy);
    bloquearFechas(true);

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
        } else if (periodoFiltro.value === 'anio') {
            const primerDiaAnio = new Date(hoy.getFullYear(), 0, 1);
            fechaInicioInput.value = fechaISO(primerDiaAnio);
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

function limitesFechas() {
    const inicio = fechaInicioInput.value ? new Date(`${fechaInicioInput.value}T00:00:00`) : null;
    const fin = fechaFinInput.value ? new Date(`${fechaFinInput.value}T23:59:59.999`) : null;
    return { inicio, fin };
}

function construirQuery() {
    const condiciones = rangoFechas();
    condiciones.push(orderBy("fecha", "desc"));
    return query(collection(db, "ventas"), ...condiciones);
}

function formatearMoneda(valor) {
    return `$${Number(valor).toFixed(2)}`;
}

function fechaReporteSegura(valor) {
    const fecha = String(valor || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : '';
}

// Adelantos y pagos se leen completos (el Neto Real depende de todo el
// historial). Se reutilizan 60 s para no releerlos al cambiar filtros.
const TTL_PERSONAL_MS = 60 * 1000;
const cachePersonal = new Map();

function leerColeccionCacheada(nombre) {
    const guardado = cachePersonal.get(nombre);
    if (guardado && Date.now() - guardado.hora < TTL_PERSONAL_MS) {
        return Promise.resolve(guardado.snap);
    }
    return getDocsSafe(query(collection(db, nombre), orderBy("fecha", "asc")))
        .then((snap) => {
            cachePersonal.set(nombre, { snap, hora: Date.now() });
            return snap;
        });
}

async function cargarReporte() {
    btnConsultar.disabled = true;

    try {
        const [querySnapshot, gastosSnap, adelantosSnap, pagosSnap] = await Promise.all([
            getDocsSafe(construirQuery()),
            getDocsSafe(query(collection(db, "gastos_inventario"), ...rangoFechas(), orderBy("fecha", "desc"))),
            leerColeccionCacheada("adelantos"),
            leerColeccionCacheada("pagos_personal")
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

            // Efectivo REAL recaudado en el período: contado + abonos. Se
            // acumula sin depender del filtro de estado porque alimenta la
            // fórmula de la utilidad neta y la tarjeta de efectivo total.
            if (estado === 'pagado' || estado === 'abono') {
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

        const { inicio, fin } = limitesFechas();
        const pagosTrabajadores = construirPagosTrabajadores(adelantosSnap, pagosSnap, inicio, fin);

        // Totales del período tras vincular adelantos históricos con cada liquidación:
        //  - totalPagosPersonal: salario BRUTO liquidado en el período.
        //  - totalAdelantos: adelantos entregados dentro del período.
        //  - netoLiquidado: Neto Real pagado = salario bruto − adelantos históricos
        //    que esa liquidación consumió (aunque el adelanto sea de días anteriores).
        //  - totalAPagar: efectivo REAL entregado a personal en el período
        //    (adelantos del período + Neto Liquidado).
        const totalPagosPersonal = pagosTrabajadores.reduce((s, f) => s + f.salarioTotal, 0);
        const totalAdelantos = pagosTrabajadores.reduce((s, f) => s + f.adelantos, 0);
        const netoLiquidado = pagosTrabajadores.reduce((s, f) => s + f.netoLiquidado, 0);
        const totalAPagar = totalAdelantos + netoLiquidado;
        // Utilidad Neta = Ventas de Contado - Gastos (Insumos) - Personal entregado.
        // Cada liquidación refleja el Neto Real pagado hoy (bruto − adelantos históricos),
        // por lo que los adelantos de días anteriores NO vuelven a descontarse al filtrar
        // por períodos cortos como "Hoy". Se basa EXCLUSIVAMENTE en el flujo de efectivo
        // real del período: solo el contado recaudado entra a la fórmula. Las ventas
        // fiadas (crédito) y los abonos NO la alteran.
        const utilidadNeta = ingresosContado - totalGastos - totalAPagar;

        const totalFacturado = totalContado + totalAbonos;
        const totalPendiente = Math.max(0, totalCredito - totalAbonos);

        const insights = calcularInsightsDeVenta({
            ventas: querySnapshot.docs.map((d) => d.data()),
            periodo: periodoFiltro.value,
            inicioISO: fechaInicioInput.value,
            finISO: fechaFinInput.value
        });

        ultimoReporte = {
            fechaInicio: fechaReporteSegura(fechaInicioInput.value),
            fechaFin: fechaReporteSegura(fechaFinInput.value),
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
            netoLiquidado,
            totalAPagar,
            utilidadNeta,
            gastosPorProducto,
            pagosTrabajadores,
            clientes: Object.entries(clientesMap).sort((a, b) => b[1] - a[1]).slice(0, 5),
            insights
        };

        lblResIngresosContado.textContent = formatearMoneda(ingresosContado);
        lblResGastos.textContent = formatearMoneda(totalGastos);
        lblResPersonal.textContent = formatearMoneda(totalAPagar);
        lblResPersonalDetalle.textContent = `Salario Bruto: ${formatearMoneda(totalPagosPersonal)} · Adelantos: ${formatearMoneda(totalAdelantos)} · Neto Liquidado: ${formatearMoneda(netoLiquidado)}`;
        lblResAdelantos.textContent = formatearMoneda(totalAdelantos);
        lblResUtilidad.textContent = formatearMoneda(utilidadNeta);
        lblResUtilidad.style.color = utilidadNeta >= 0 ? "var(--success)" : "var(--danger)";

        renderPagosTrabajadores(pagosTrabajadores);
        renderGastosPorProducto(gastosPorProducto);
        renderInsights(insights);

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

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function fechaVentaLocal(venta) {
    const fecha = venta.fecha && venta.fecha.toDate
        ? venta.fecha.toDate()
        : (venta.fecha instanceof Date ? venta.fecha : new Date(venta.fecha));
    return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function resolverTipoInsight(periodo, inicioISO, finISO) {
    if (periodo === 'semana' || periodo === 'mes' || periodo === 'anio') return periodo;
    if (periodo !== 'personalizado' || !inicioISO || !finISO) return '';
    const inicio = new Date(`${inicioISO}T00:00:00`);
    const fin = new Date(`${finISO}T00:00:00`);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || fin < inicio) return '';
    const diasRango = Math.round((fin - inicio) / 86400000) + 1;
    if (diasRango <= 7) return 'semana';
    const mismoMes = inicio.getFullYear() === fin.getFullYear() && inicio.getMonth() === fin.getMonth();
    if (diasRango <= 31 && mismoMes) return 'mes';
    return 'anio';
}

function calcularInsightsDeVenta(data) {
    const ventas = (data && data.ventas) || (Array.isArray(data) ? data : []);
    const periodo = (data && data.periodo) || '';
    const tipoRango = resolverTipoInsight(periodo, (data && data.inicioISO) || '', (data && data.finISO) || '');

    // Las ventas fechadas en el futuro se descartan para no inflar semanas
    // ni meses que aún no ocurren.
    const corte = new Date();
    corte.setHours(23, 59, 59, 999);

    // Solo cuenta la facturación real (contado + crédito), igual que el "Total Facturado".
    const facturadas = [];
    ventas.forEach((venta) => {
        const estado = venta.estadoPago || 'pagado';
        if (estado !== 'pagado' && estado !== 'debe') return;
        const fecha = fechaVentaLocal(venta);
        if (!fecha || fecha > corte) return;
        facturadas.push({
            monto: Number(venta.totalVenta) || 0,
            anio: fecha.getFullYear(),
            mes: fecha.getMonth() + 1,
            dia: fecha.getDate(),
            nombreDia: DIAS_SEMANA[fecha.getDay()]
        });
    });

    if (facturadas.length === 0) {
        return { tipo: 'insuficiente' };
    }

    // Agrupa por día específico (clave YYYY-MM-DD).
    const porDia = new Map();
    facturadas.forEach((v) => {
        const clave = `${v.anio}-${String(v.mes).padStart(2, '0')}-${String(v.dia).padStart(2, '0')}`;
        const entrada = porDia.get(clave) || { ...v, fechaClave: clave, monto: 0 };
        entrada.monto += v.monto;
        porDia.set(clave, entrada);
    });
    const dias = [...porDia.values()];
    const totalPeriodo = dias.reduce((s, d) => s + d.monto, 0);

    if (tipoRango === 'semana') {
        let diaMayor = dias[0];
        let diaMenor = dias[0];
        dias.forEach((d) => {
            if (d.monto > diaMayor.monto) diaMayor = d;
            if (d.monto < diaMenor.monto) diaMenor = d;
        });
        return {
            tipo: 'semana',
            diaMayor: { nombre: diaMayor.nombreDia, fecha: diaMayor.fechaClave, monto: diaMayor.monto },
            diaMenor: { nombre: diaMenor.nombreDia, fecha: diaMenor.fechaClave, monto: diaMenor.monto },
            promedioDiario: totalPeriodo / dias.length,
            diasConVentas: dias.length
        };
    }

    if (tipoRango === 'mes') {
        // Semanas del mes en bloques fijos de 7 días: 1 = días 1-7, 2 = 8-14,
        // 3 = 15-21, 4 = 22-28, 5 = 29+. La clave incluye año y mes para que
        // un rango que cruce dos meses nunca mezcle ventas de ambos.
        const porSemana = new Map();
        dias.forEach((d) => {
            const numero = Math.floor((d.dia - 1) / 7) + 1;
            const clave = `${d.anio}-${String(d.mes).padStart(2, '0')}-S${numero}`;
            porSemana.set(clave, (porSemana.get(clave) || 0) + d.monto);
        });

        let semanaMayor = null;
        let semanaMenor = null;
        porSemana.forEach((monto, clave) => {
            const numero = Number(clave.split('-S')[1]);
            if (!semanaMayor || monto > semanaMayor.monto) semanaMayor = { numero, monto };
            if (!semanaMenor || monto < semanaMenor.monto) semanaMenor = { numero, monto };
        });

        let mejorDiaMes = dias[0];
        dias.forEach((d) => {
            if (d.monto > mejorDiaMes.monto) mejorDiaMes = d;
        });

        return {
            tipo: 'mes',
            semanaMayor,
            semanaMenor,
            mejorDiaMes: { nombre: mejorDiaMes.nombreDia, fecha: mejorDiaMes.fechaClave, monto: mejorDiaMes.monto }
        };
    }

    if (tipoRango === 'anio') {
        const porMes = new Map();
        facturadas.forEach((v) => {
            const clave = String(v.mes).padStart(2, '0');
            const entrada = porMes.get(clave) || { numero: v.mes, nombre: MESES[v.mes - 1], monto: 0 };
            entrada.monto += v.monto;
            porMes.set(clave, entrada);
        });
        const meses = [...porMes.values()];
        let mesMayor = meses[0];
        let mesMenor = meses[0];
        meses.forEach((m) => {
            if (m.monto > mesMayor.monto) mesMayor = m;
            if (m.monto < mesMenor.monto) mesMenor = m;
        });

        return {
            tipo: 'anio',
            mesMayor: { nombre: mesMayor.nombre, monto: mesMayor.monto },
            mesMenor: { nombre: mesMenor.nombre, monto: mesMenor.monto },
            promedioMensual: totalPeriodo / meses.length,
            mesesConVentas: meses.length
        };
    }

    return { tipo: 'insuficiente' };
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

function construirPagosTrabajadores(adelantosSnap, pagosSnap, inicio, fin) {
    const mapa = new Map();

    function fechaDe(docSnap) {
        const f = docSnap.data().fecha;
        return f && f.toDate ? f.toDate() : null;
    }

    function acumular(docSnap, tipo) {
        const d = docSnap.data();
        const nombre = d.trabajador || "Sin asignar";
        const monto = Number(d.monto) || 0;

        if (!mapa.has(nombre)) {
            mapa.set(nombre, { trabajador: nombre, adelantos: [], pagos: [] });
        }
        mapa.get(nombre)[tipo].push({ fecha: fechaDe(docSnap), monto });
    }

    adelantosSnap.forEach((docSnap) => acumular(docSnap, "adelantos"));
    pagosSnap.forEach((docSnap) => acumular(docSnap, "pagos"));

    const enPeriodo = (fecha) => fecha !== null && (!inicio || fecha >= inicio) && (!fin || fecha <= fin);

    return [...mapa.values()]
        .map((fila) => {
            const adelantosOrd = fila.adelantos
                .filter((a) => a.fecha !== null)
                .sort((a, b) => a.fecha - b.fecha);
            const pagosOrd = fila.pagos
                .filter((p) => p.fecha !== null)
                .sort((a, b) => a.fecha - b.fecha);

            // Vinculación de adelantos históricos: cada liquidación consume los
            // adelantos registrados hasta la fecha de pago (aunque sean de días
            // anteriores) para obtener el Neto Real entregado en esa liquidación.
            // Un adelanto solo se descuenta una vez: al liquidar el salario que cubre.
            let iAdelantos = 0;
            let disponibles = 0;
            const pagosNeto = pagosOrd.map((pago) => {
                while (iAdelantos < adelantosOrd.length && adelantosOrd[iAdelantos].fecha <= pago.fecha) {
                    disponibles += adelantosOrd[iAdelantos].monto;
                    iAdelantos++;
                }
                const consumido = Math.min(disponibles, pago.monto);
                disponibles -= consumido;
                return { fecha: pago.fecha, monto: pago.monto, neto: pago.monto - consumido };
            });

            return {
                trabajador: fila.trabajador,
                salarioTotal: pagosNeto.filter((p) => enPeriodo(p.fecha)).reduce((s, p) => s + p.monto, 0),
                adelantos: fila.adelantos.filter((a) => enPeriodo(a.fecha)).reduce((s, a) => s + a.monto, 0),
                netoLiquidado: pagosNeto.filter((p) => enPeriodo(p.fecha)).reduce((s, p) => s + p.neto, 0),
                totalPagar: pagosNeto.filter((p) => enPeriodo(p.fecha)).reduce((s, p) => s + p.neto, 0)
            };
        })
        .filter((f) => f.salarioTotal > 0 || f.adelantos > 0)
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

function renderInsights(insights) {
    if (!insightsContainer) return;

    if (!insights || insights.tipo === 'insuficiente') {
        insightsContainer.innerHTML = '';
        insightsContainer.classList.add('oculto');
        return;
    }

    const tarjeta = (lbl, val, montoHtml) => `
            <div class="insight-card">
                <span class="insight-lbl">${escapeHtml(lbl)}</span>
                <span class="insight-val">${val}</span>
                <span class="insight-monto">${montoHtml}</span>
            </div>`;
    const tarjetas = [];

    if (insights.tipo === 'semana') {
        tarjetas.push(
            tarjeta('Día con mayor facturación', escapeHtml(insights.diaMayor.nombre), formatearMoneda(insights.diaMayor.monto)),
            tarjeta('Día con menor facturación', escapeHtml(insights.diaMenor.nombre), formatearMoneda(insights.diaMenor.monto)),
            tarjeta('Promedio de venta diaria', formatearMoneda(insights.promedioDiario), `${insights.diasConVentas} días con ventas`)
        );
    } else if (insights.tipo === 'mes') {
        tarjetas.push(
            tarjeta('Semana con mayor facturación', `Semana ${insights.semanaMayor.numero}`, formatearMoneda(insights.semanaMayor.monto)),
            tarjeta('Semana con menor facturación', `Semana ${insights.semanaMenor.numero}`, formatearMoneda(insights.semanaMenor.monto)),
            tarjeta('Mejor día del mes', escapeHtml(insights.mejorDiaMes.nombre), formatearMoneda(insights.mejorDiaMes.monto))
        );
    } else if (insights.tipo === 'anio') {
        tarjetas.push(
            tarjeta('Mes con mayor facturación', escapeHtml(insights.mesMayor.nombre), formatearMoneda(insights.mesMayor.monto)),
            tarjeta('Mes con menor facturación', escapeHtml(insights.mesMenor.nombre), formatearMoneda(insights.mesMenor.monto)),
            tarjeta('Promedio de venta mensual', formatearMoneda(insights.promedioMensual), `${insights.mesesConVentas} meses con ventas`)
        );
    }

    insightsContainer.innerHTML = `
        <h2 class="section-title">🧠 Insights Inteligentes</h2>
        <div class="insights-grid">${tarjetas.join('')}</div>`;
    insightsContainer.classList.remove('oculto');
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

    if (accion === 'imprimir') {
        imprimirEnVistaActual(renderizarReporteHtml(ultimoReporte));
        return;
    }

    window.open(`reporte-impresion.html?accion=${accion}`, '_blank');
}

btnImprimir.addEventListener('click', () => abrirVistaImpresion('imprimir'));

btnPdf.addEventListener('click', () => abrirVistaImpresion('descargar'));
