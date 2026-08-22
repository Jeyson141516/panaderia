export function formatearMoneda(valor) {
    return `$${Number(valor).toFixed(2)}`;
}

export function escapeHtml(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto ?? '');
    return div.innerHTML;
}

export function etiquetaPeriodo(p) {
    if (p === 'hoy') return 'Hoy';
    if (p === 'semana') return 'Semana';
    if (p === 'mes') return 'Mes';
    return 'Personalizado';
}

export function etiquetaEstado(e) {
    const mapa = {
        todos: 'Todos',
        pagado: 'Pagado (Contado)',
        debe: 'Por Cobrar (Fiado)',
        abono: 'Abonos (Pagos de Deuda)'
    };
    return mapa[e] || e;
}

function pintarInsightsHtml(r) {
    const ins = r.insights;
    const seccion = '<h2 class="seccion">Insights Inteligentes</h2>';

    // Sin datos suficientes: se oculta por completo para que las tarjetas
    // financieras ocupen su posición original.
    if (!ins || ins.tipo === 'insuficiente') {
        return '';
    }

    const tarjeta = (lbl, val, monto) => `
                <div class="insight-card">
                    <span class="insight-lbl">${lbl}</span>
                    <span class="insight-val">${val}</span>
                    <span class="insight-monto">${monto}</span>
                </div>`;
    let tarjetas = '';

    if (ins.tipo === 'semana') {
        tarjetas =
            tarjeta('Día con mayor facturación', escapeHtml(ins.diaMayor.nombre), formatearMoneda(ins.diaMayor.monto)) +
            tarjeta('Día con menor facturación', escapeHtml(ins.diaMenor.nombre), formatearMoneda(ins.diaMenor.monto)) +
            tarjeta('Promedio de venta diaria', formatearMoneda(ins.promedioDiario), `${ins.diasConVentas} días con ventas`);
    } else if (ins.tipo === 'mes') {
        tarjetas =
            tarjeta('Semana con mayor facturación', `Semana ${ins.semanaMayor.numero}`, formatearMoneda(ins.semanaMayor.monto)) +
            tarjeta('Semana con menor facturación', `Semana ${ins.semanaMenor.numero}`, formatearMoneda(ins.semanaMenor.monto)) +
            tarjeta('Mejor día del mes', escapeHtml(ins.mejorDiaMes.nombre), formatearMoneda(ins.mejorDiaMes.monto));
    } else if (ins.tipo === 'anio') {
        tarjetas =
            tarjeta('Mes con mayor facturación', escapeHtml(ins.mesMayor.nombre), formatearMoneda(ins.mesMayor.monto)) +
            tarjeta('Mes con menor facturación', escapeHtml(ins.mesMenor.nombre), formatearMoneda(ins.mesMenor.monto)) +
            tarjeta('Promedio de venta mensual', formatearMoneda(ins.promedioMensual), `${ins.mesesConVentas} meses con ventas`);
    }

    return `
        <div id="insightsContainer" class="insights">
            ${seccion}
            <div class="insights-grid">${tarjetas}</div>
        </div>`;
}

function gastosPorProductoHtml(r) {
    const items = r.gastosPorProducto || [];
    const cuerpo = items.length > 0
        ? items.map((g) =>
            `<tr><td>${escapeHtml(g.producto || 'Otros')}</td><td style="text-align: right;">${formatearMoneda(g.totalInvertido)}</td></tr>`).join('')
        : '<tr><td colspan="2" class="sin-datos">Sin gastos en el período seleccionado.</td></tr>';

    return `
        <section class="tabla-gastos">
            <h2 class="seccion">Resumen de Gastos por Producto</h2>
            <table class="classic-table">
                <thead>
                    <tr>
                        <th style="text-align: left;">Concepto / Insumo</th>
                        <th style="text-align: right;">Total Invertido ($)</th>
                    </tr>
                </thead>
                <tbody>${cuerpo}</tbody>
            </table>
        </section>`;
}

export function renderizarReporteHtml(r) {
    const periodo = escapeHtml(etiquetaPeriodo(r.periodo));
    const fechaInicio = escapeHtml(r.fechaInicio || 'inicio');
    const fechaFin = escapeHtml(r.fechaFin || 'hoy');
    const estado = escapeHtml(etiquetaEstado(r.estado));
    const pagosHtml = (r.pagosTrabajadores || []).length > 0
        ? r.pagosTrabajadores.map((f) =>
            `<tr><td>${escapeHtml(f.trabajador)}</td><td class="num">${formatearMoneda(f.salarioTotal)}</td><td class="num">${formatearMoneda(f.adelantos)}</td><td class="num"><b>${formatearMoneda(f.totalPagar)}</b></td></tr>`).join('')
        : '<tr><td colspan="4" class="sin-datos">Sin datos en el rango seleccionado.</td></tr>';

    const clientesHtml = (r.clientes || []).length > 0
        ? r.clientes.map(([cli, fundas], index) =>
            `<tr><td>${index + 1}</td><td>${escapeHtml(cli)}</td><td class="num">${fundas} fundas</td></tr>`).join('')
        : '<tr><td colspan="3" class="sin-datos">Sin datos en el rango seleccionado.</td></tr>';

    const ventasHtml = [
        ['Ventas de Contado (Efectivo)', formatearMoneda(r.totalContado)],
        ['Fiado / Crédito', formatearMoneda(r.totalCredito)],
        ['Abonos recibidos', formatearMoneda(r.totalAbonos)],
        ['Pendiente de cobro', formatearMoneda(r.totalPendiente)],
        ['Total Facturado', formatearMoneda(r.totalFacturado)],
        ['Fundas vendidas', `${r.totalFundas} fundas`]
    ].map(([concepto, valor]) =>
        `<tr><td>${concepto}</td><td class="num">${valor}</td></tr>`).join('');

    const fechaGeneracion = new Date().toLocaleString('es-EC');

    return `
        <header class="membrete">
            <div class="membrete-izq">
                <img src="img/icono.jpg" class="logo-reporte" alt="Logo de Panadería El Vacán">
                <div>
                    <div class="negocio">Panadería El Vacán</div>
                    <div class="subtitulo">Documento Financiero</div>
                </div>
            </div>
            <div class="titulo-doc">Reporte de Ventas y Finanzas</div>
        </header>

        <div class="meta">
            <span>Período: <b>${periodo}</b> · Del <b>${fechaInicio}</b> al <b>${fechaFin}</b> · Estado: <b>${estado}</b></span>
            <span class="fecha">Generado: ${fechaGeneracion}</span>
        </div>

        ${pintarInsightsHtml(r)}

        <h2 class="seccion">Resumen Financiero</h2>
        <table>
            <thead><tr><th>Concepto</th><th class="num">Valor</th></tr></thead>
            <tbody>
                <tr><td>Ventas de Contado (Efectivo)</td><td class="num">${formatearMoneda(r.ingresosContado)}</td></tr>
                <tr><td>Gastos (Insumos)</td><td class="num">${formatearMoneda(r.totalGastos)}</td></tr>
                <tr><td>Total a Pagar a Personal</td><td class="num">${formatearMoneda(r.totalAPagar)}</td></tr>
                <tr><td>Adelantos (Salida de Caja)</td><td class="num">${formatearMoneda(r.totalAdelantos)}</td></tr>
                <tr class="fila-total"><td>Utilidad Neta</td><td class="num">${formatearMoneda(r.utilidadNeta)}</td></tr>
            </tbody>
        </table>
        <p class="nota">Nota: Utilidad = Ventas de Contado − Gastos (Insumos) − Personal entregado. Cada liquidación descuenta los adelantos históricos del empleado (previos a la fecha de pago) y refleja el Neto Real entregado (Salario Bruto − Adelantos aplicados); los adelantos del período se descuentan por separado. Un adelanto solo se descuenta una vez y los de días anteriores no vuelven a descontarse (ya afectaron la caja en su momento). Los fiados y abonos no alteran esta fórmula (efectivo real de caja). Detalle Personal — Salario Bruto: <b>${formatearMoneda(r.totalPagosPersonal)}</b> · Adelantos: <b>${formatearMoneda(r.totalAdelantos)}</b> · Neto Liquidado: <b>${formatearMoneda(r.netoLiquidado || 0)}</b></p>

        <h2 class="seccion">Pagos por Trabajador</h2>
        <table>
            <thead><tr><th>Trabajador</th><th class="num">Salario Total</th><th class="num">Adelantos</th><th class="num">Total a Pagar</th></tr></thead>
            <tbody>${pagosHtml}</tbody>
        </table>

        <h2 class="seccion">Detalle de Ventas</h2>
        <table>
            <thead><tr><th>Concepto</th><th class="num">Total</th></tr></thead>
            <tbody>${ventasHtml}</tbody>
        </table>

        <h2 class="seccion">Mejores Clientes</h2>
        <table>
            <thead><tr><th>#</th><th>Cliente</th><th class="num">Fundas</th></tr></thead>
            <tbody>${clientesHtml}</tbody>
        </table>

        ${gastosPorProductoHtml(r)}

        <footer class="pie">
            <span>Panadería El Vacán · Reporte de Ventas y Finanzas</span>
            <span>Página 1 de 1</span>
        </footer>
    `;
}
