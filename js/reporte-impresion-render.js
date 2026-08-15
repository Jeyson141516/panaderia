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

    if (ins.tipo === 'semana') {
        return `
            <div id="insightsContainer" class="insights">
                ${seccion}
                <div class="insights-grid">
                    <div class="insight-card">
                        <span class="insight-lbl">Día con mayor facturación</span>
                        <span class="insight-val">${escapeHtml(ins.diaEstrella.nombre)}</span>
                        <span class="insight-monto">${formatearMoneda(ins.diaEstrella.monto)}</span>
                    </div>
                </div>
            </div>`;
    }

    return `
        <div id="insightsContainer" class="insights">
            ${seccion}
            <div class="insights-grid">
                <div class="insight-card">
                    <span class="insight-lbl">Día con mayor facturación</span>
                    <span class="insight-val">${escapeHtml(ins.mejorDiaMes.nombre)}</span>
                    <span class="insight-monto">${formatearMoneda(ins.mejorDiaMes.monto)}</span>
                </div>
                <div class="insight-card">
                    <span class="insight-lbl">Semana con mayor facturación</span>
                    <span class="insight-val">Semana ${ins.semanaGanadora.numero}</span>
                    <span class="insight-monto">${formatearMoneda(ins.semanaGanadora.monto)}</span>
                </div>
                <div class="insight-card">
                    <span class="insight-lbl">Mejor día de la mejor semana</span>
                    <span class="insight-val">${escapeHtml(ins.mejorDiaSemana.nombre)}</span>
                    <span class="insight-monto">${formatearMoneda(ins.mejorDiaSemana.monto)}</span>
                </div>
            </div>
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
            <span>Período: <b>${etiquetaPeriodo(r.periodo)}</b> · Del <b>${r.fechaInicio || 'inicio'}</b> al <b>${r.fechaFin || 'hoy'}</b> · Estado: <b>${etiquetaEstado(r.estado)}</b></span>
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
        <p class="nota">Nota: Utilidad = Ventas de Contado − Gastos (Insumos) − Total Adelantos Entregados. Los fiados y abonos no alteran esta fórmula (efectivo real de caja). Detalle Personal — Salario Total: <b>${formatearMoneda(r.totalPagosPersonal)}</b> · Adelantos: <b>${formatearMoneda(r.totalAdelantos)}</b></p>

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
