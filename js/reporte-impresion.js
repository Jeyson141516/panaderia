const CLAVE_REPORTE = 'panaderia:reporte-actual';
const params = new URLSearchParams(location.search);
const accionAuto = params.get('accion');

const estadoMensaje = document.getElementById('estadoMensaje');
const reporteDocumento = document.getElementById('reporteDocumento');
const btnImprimir = document.getElementById('btnImprimir');
const btnDescargar = document.getElementById('btnDescargar');
const btnVolver = document.getElementById('btnVolver');
const btnIrReportes = document.getElementById('btnIrReportes');

function formatearMoneda(valor) {
    return `$${Number(valor).toFixed(2)}`;
}

function escapeHtml(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto ?? '');
    return div.innerHTML;
}

function etiquetaPeriodo(p) {
    if (p === 'hoy') return 'Hoy';
    if (p === 'semana') return 'Semana';
    if (p === 'mes') return 'Mes';
    return 'Personalizado';
}

function etiquetaEstado(e) {
    const mapa = {
        todos: 'Todos',
        pagado: 'Pagado (Contado)',
        debe: 'Por Cobrar (Fiado)',
        abono: 'Abonos (Pagos de Deuda)'
    };
    return mapa[e] || e;
}

function obtenerReporte() {
    try {
        const crudo = localStorage.getItem(CLAVE_REPORTE);
        if (!crudo) return null;
        const datos = JSON.parse(crudo);
        return datos && typeof datos === 'object' ? datos : null;
    } catch (e) {
        return null;
    }
}

function pintarDocumento() {
    const r = obtenerReporte();
    if (!r) {
        reporteDocumento.classList.add('oculto');
        estadoMensaje.classList.remove('oculto');
        return null;
    }

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

    reporteDocumento.innerHTML = `
        <header class="membrete">
            <div>
                <div class="negocio">Panadería Familiar</div>
                <div class="subtitulo">Documento Financiero</div>
            </div>
            <div class="titulo-doc">Reporte de Ventas y Finanzas</div>
        </header>

        <div class="meta">
            <span>Período: <b>${etiquetaPeriodo(r.periodo)}</b> · Del <b>${r.fechaInicio || 'inicio'}</b> al <b>${r.fechaFin || 'hoy'}</b> · Estado: <b>${etiquetaEstado(r.estado)}</b></span>
            <span class="fecha">Generado: ${fechaGeneracion}</span>
        </div>

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

        <footer class="pie">
            <span>Panadería Familiar · Reporte de Ventas y Finanzas</span>
            <span>Página 1 de 1</span>
        </footer>
    `;

    return r;
}

function imprimirDocumento() {
    if (!obtenerReporte()) return;
    window.print();
}

function esperarJsPDF(tiempoMax = 8000) {
    return new Promise((resolver) => {
        if (typeof window.jspdf !== 'undefined') {
            resolver();
            return;
        }
        const inicio = Date.now();
        const intervalo = setInterval(() => {
            if (typeof window.jspdf !== 'undefined') {
                clearInterval(intervalo);
                resolver();
            } else if (Date.now() - inicio > tiempoMax) {
                clearInterval(intervalo);
                resolver();
            }
        }, 100);
    });
}

function descargarPdf() {
    const r = obtenerReporte();
    if (!r) return;

    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
        alert('La librería de PDF no cargó. Revisa tu conexión e inténtalo de nuevo.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const MARGEN = 18;
    const ANCHO = 174;
    const LIMITE = 282;
    const NEGRO = [0, 0, 0];
    const GRIS = [70, 70, 70];
    const GRIS_SUAVE = [110, 110, 110];
    const CABECERA = [236, 238, 241];
    let y = 20;

    function avanza(alto) {
        y += alto;
        if (y > LIMITE) {
            pdf.addPage();
            y = 20;
        }
    }

    function encabezadoSeccion(titulo) {
        avanza(6.5);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(...NEGRO);
        pdf.text(String(titulo).toUpperCase(), MARGEN, y);
        y += 2.4;
        pdf.setDrawColor(...NEGRO);
        pdf.setLineWidth(0.5);
        pdf.line(MARGEN, y, MARGEN + ANCHO, y);
        y += 4;
    }

    function textoFlujo(texto, opciones = {}) {
        const { size = 8, estilo = 'normal', color = NEGRO, maxAncho = ANCHO } = opciones;
        pdf.setFont('helvetica', estilo);
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
        pdf.splitTextToSize(String(texto), maxAncho).forEach((linea) => {
            if (y > LIMITE) {
                pdf.addPage();
                y = 20;
            }
            pdf.text(linea, MARGEN, y);
            y += size / 3 + 1.2;
        });
    }

    function tabla(columnas, filas, opciones = {}) {
        const anchos = opciones.anchos || [];
        const alinear = opciones.alinear || [];
        const altoCabecera = 6;
        const altoFila = 5.6;
        const destacarUltima = opciones.destacarUltima === true;

        function dibujarFila(fila, yRow, alto, { relleno = false, superior = 0.3, inferior = 0.3, estilo = 'normal' } = {}) {
            if (relleno) {
                pdf.setFillColor(...CABECERA);
                pdf.rect(MARGEN, yRow, ANCHO, alto, 'F');
            }
            pdf.setDrawColor(...NEGRO);
            pdf.setLineWidth(superior);
            pdf.line(MARGEN, yRow, MARGEN + ANCHO, yRow);
            pdf.setLineWidth(inferior);
            pdf.line(MARGEN, yRow + alto, MARGEN + ANCHO, yRow + alto);
            pdf.setFont('helvetica', estilo);
            pdf.setFontSize(estilo === 'bold' ? 7.5 : 8.5);
            pdf.setTextColor(...NEGRO);
            let x = MARGEN;
            fila.forEach((celda, i) => {
                const ancho = anchos[i] || ANCHO / columnas.length;
                const linea = pdf.splitTextToSize(String(celda), ancho - 3)[0] || '';
                if (alinear[i] === 'right') {
                    pdf.text(linea, x + ancho - 1.5, yRow + 4, { align: 'right' });
                } else {
                    pdf.text(linea, x + 1.5, yRow + 4);
                }
                x += ancho;
            });
        }

        if (y + altoCabecera > LIMITE) {
            pdf.addPage();
            y = 20;
        }
        dibujarFila(columnas, y, altoCabecera, { relleno: true, superior: 0.6, inferior: 0.6, estilo: 'bold' });
        y += altoCabecera;

        filas.forEach((fila, idx) => {
            if (y + altoFila > LIMITE) {
                pdf.addPage();
                y = 20;
                dibujarFila(columnas, y, altoCabecera, { relleno: true, superior: 0.6, inferior: 0.6, estilo: 'bold' });
                y += altoCabecera;
            }
            const esUltima = destacarUltima && idx === filas.length - 1;
            dibujarFila(fila, y, altoFila, {
                superior: esUltima ? 1 : 0.3,
                estilo: esUltima ? 'bold' : 'normal'
            });
            y += altoFila;
        });
        y += 2;
    }

    /* ---------- Cabecera corporativa ---------- */
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(...NEGRO);
    pdf.text('Panadería Familiar', MARGEN, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...GRIS);
    pdf.text('Documento Financiero', MARGEN, y + 5.2);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(...NEGRO);
    pdf.text('Reporte de Ventas y Finanzas', MARGEN + ANCHO, y + 0.8, { align: 'right' });

    /* Línea divisoria sólida */
    y += 10;
    pdf.setDrawColor(...NEGRO);
    pdf.setLineWidth(1.1);
    pdf.line(MARGEN, y, MARGEN + ANCHO, y);
    y += 5;

    /* ---------- Metadatos ---------- */
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...GRIS);
    pdf.text(`Período: ${etiquetaPeriodo(r.periodo)}  ·  Del ${r.fechaInicio || 'inicio'} al ${r.fechaFin || 'hoy'}  ·  Estado: ${etiquetaEstado(r.estado)}`, MARGEN, y);
    pdf.text(`Generado: ${new Date().toLocaleString('es-EC')}`, MARGEN + ANCHO, y, { align: 'right' });
    y += 6;

    /* ---------- Resumen Financiero (tabla clásica de 2 columnas) ---------- */
    encabezadoSeccion('Resumen Financiero');
    const itemsResumen = [
        ['Ventas de Contado (Efectivo)', formatearMoneda(r.ingresosContado)],
        ['Gastos (Insumos)', formatearMoneda(r.totalGastos)],
        ['Total a Pagar a Personal', formatearMoneda(r.totalAPagar)],
        ['Adelantos (Salida de Caja)', formatearMoneda(r.totalAdelantos)],
        ['Utilidad Neta', formatearMoneda(r.utilidadNeta)]
    ];
    tabla(
        ['Concepto', 'Valor'],
        itemsResumen,
        { anchos: [100, 74], alinear: ['left', 'right'], destacarUltima: true }
    );

    textoFlujo(`Nota: Utilidad = Ventas de Contado − Gastos (Insumos) − Total Adelantos Entregados. ` +
        `Los fiados y abonos no alteran esta fórmula (efectivo real de caja). ` +
        `Detalle Personal — Salario Total: ${formatearMoneda(r.totalPagosPersonal)}  ·  Adelantos: ${formatearMoneda(r.totalAdelantos)}`, { size: 7.5, color: GRIS });

    /* ---------- Pagos por Trabajador ---------- */
    encabezadoSeccion('Pagos por Trabajador');
    const pagosFilas = (r.pagosTrabajadores || []).length > 0
        ? r.pagosTrabajadores.map((f) => [
            f.trabajador,
            formatearMoneda(f.salarioTotal),
            formatearMoneda(f.adelantos),
            formatearMoneda(f.totalPagar)
        ])
        : [['Sin datos en el rango seleccionado', '', '', '']];
    tabla(
        ['Trabajador', 'Salario Total', 'Adelantos', 'Total a Pagar'],
        pagosFilas,
        { anchos: [86, 30, 28, 30], alinear: ['left', 'right', 'right', 'right'] }
    );

    /* ---------- Detalle de Ventas ---------- */
    encabezadoSeccion('Detalle de Ventas');
    const ventasFilas = [
        ['Ventas de Contado (Efectivo)', formatearMoneda(r.totalContado)],
        ['Fiado / Crédito', formatearMoneda(r.totalCredito)],
        ['Abonos recibidos', formatearMoneda(r.totalAbonos)],
        ['Pendiente de cobro', formatearMoneda(r.totalPendiente)],
        ['Total Facturado', formatearMoneda(r.totalFacturado)],
        ['Fundas vendidas', `${r.totalFundas} fundas`]
    ];
    tabla(
        ['Concepto', 'Total'],
        ventasFilas,
        { anchos: [100, 74], alinear: ['left', 'right'] }
    );

    /* ---------- Mejores Clientes ---------- */
    encabezadoSeccion('Mejores Clientes');
    const clientesFilas = (r.clientes || []).length > 0
        ? r.clientes.map(([cli, fundas], index) => [String(index + 1), cli, `${fundas} fundas`])
        : [['', 'Sin datos en el rango seleccionado', '']];
    tabla(
        ['#', 'Cliente', 'Fundas'],
        clientesFilas,
        { anchos: [14, 112, 48], alinear: ['left', 'left', 'right'] }
    );

    /* ---------- Pie y numeración ---------- */
    const totalPaginas = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= totalPaginas; i++) {
        pdf.setPage(i);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(...GRIS_SUAVE);
        pdf.text('Panadería Familiar · Reporte de Ventas y Finanzas', MARGEN, 290);
        pdf.text(`Página ${i} de ${totalPaginas}`, 210 - MARGEN, 290, { align: 'right' });
    }

    const nombreArchivo = `reporte-panaderia-${r.fechaInicio || 'inicio'}-a-${r.fechaFin || 'hoy'}.pdf`;
    pdf.save(nombreArchivo);
}

btnImprimir.addEventListener('click', imprimirDocumento);
btnDescargar.addEventListener('click', descargarPdf);
btnVolver.addEventListener('click', () => { location.href = 'reportes.html'; });
btnIrReportes.addEventListener('click', () => { location.href = 'reportes.html'; });

pintarDocumento();

if (accionAuto === 'descargar' && obtenerReporte()) {
    (async () => {
        await esperarJsPDF();
        if (typeof window.jspdf !== 'undefined') {
            descargarPdf();
            setTimeout(() => window.close(), 1200);
        } else {
            estadoMensaje.querySelector('h2').textContent = 'No se pudo generar el PDF';
            estadoMensaje.querySelector('p').textContent = 'La librería de PDF no cargó. Revisa tu conexión.';
            estadoMensaje.classList.remove('oculto');
        }
    })();
} else if (accionAuto === 'imprimir' && obtenerReporte()) {
    setTimeout(() => window.print(), 300);
}
