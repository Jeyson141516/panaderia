export function formatearMoneda(valor) {
    const numero = Number(valor) || 0;
    const signo = numero < 0 ? "-" : "";
    return `${signo}$${Math.abs(numero).toFixed(2)}`;
}

export function escapeHtml(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto ?? '');
    return div.innerHTML;
}

export function etiquetaTipo(tipo) {
    return tipo === "adelanto" ? "Adelanto" : "Pago";
}

export function montoConSigno(tipo, monto) {
    return (tipo === "adelanto" ? "-" : "+") + formatearMoneda(monto);
}

export function renderizarReportePersonalHtml(r) {
    const resumenesHtml = (r.resumenes || []).length > 0
        ? r.resumenes.map((f) =>
            `<tr><td>${escapeHtml(f.nombre)}</td><td class="num">${f.movimientos}</td><td class="num">${formatearMoneda(f.adelantos)}</td><td class="num">${formatearMoneda(f.pagos)}</td><td class="num"><b>${formatearMoneda(f.balance)}</b></td></tr>`).join('')
        : '<tr><td colspan="5" class="sin-datos">Sin datos en el rango seleccionado.</td></tr>';

    const detalleHtml = (r.detalle || []).length > 0
        ? r.detalle.map((mv) =>
            `<tr><td>${escapeHtml(mv.fechaTexto || '-')}</td><td>${escapeHtml(mv.trabajador)}</td><td>${etiquetaTipo(mv.tipo)}</td><td>${escapeHtml(mv.concepto || '-')}</td><td class="num">${montoConSigno(mv.tipo, mv.monto)}</td></tr>`).join('')
        : '<tr><td colspan="5" class="sin-datos">Sin movimientos en el rango seleccionado.</td></tr>';

    const fechaGeneracion = new Date().toLocaleString('es-EC');

    return `
        <header class="membrete">
            <div class="membrete-izq">
                <img src="img/icono.jpg" class="logo-reporte" alt="Logo de Panadería El Vacán">
                <div>
                    <div class="negocio">Panadería El Vacán</div>
                    <div class="subtitulo">Documento de Personal</div>
                </div>
            </div>
            <div class="titulo-doc">Reporte de Empleados y Adelantos</div>
        </header>

        <div class="meta">
            <div class="meta-info">
                <span>Trabajador: <b>${escapeHtml(r.etiquetaTrabajador || 'Todos los empleados')}</b></span>
                <span>Período: <b>${escapeHtml(r.etiquetaPeriodo || '')}</b></span>
            </div>
            <span class="fecha">Generado: ${fechaGeneracion}</span>
        </div>

        <h2 class="seccion">Balance por trabajador</h2>
        <table>
            <thead><tr><th>Trabajador</th><th class="num">Mov.</th><th class="num">Adelantos</th><th class="num">Salario Total</th><th class="num">Total a Pagar</th></tr></thead>
            <tbody>${resumenesHtml}</tbody>
        </table>
        <p class="nota">Total a Pagar = Salario Total - Adelantos. Totales del período - Salario: <b>${formatearMoneda(r.totalPagos)}</b> · Adelantos: <b>${formatearMoneda(r.totalAdelantos)}</b> · Neto a Pagar: <b>${formatearMoneda(r.totalAPagar)}</b></p>

        <h2 class="seccion">Detalle de movimientos</h2>
        <table>
            <thead><tr><th>Fecha</th><th>Trabajador</th><th>Tipo</th><th>Concepto</th><th class="num">Monto</th></tr></thead>
            <tbody>${detalleHtml}</tbody>
        </table>

        <footer class="pie">
            <span>Panadería El Vacán · Reporte de Empleados y Adelantos</span>
            <span>Página 1 de 1</span>
        </footer>
    `;
}
