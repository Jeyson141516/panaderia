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

    const claseUtilidad = r.utilidadNeta >= 0 ? 'utilidad' : 'utilidad negativa';

    reporteDocumento.innerHTML = `
        <h1>Reporte Financiero</h1>
        <p class="org">Panadería Familiar</p>
        <p class="meta">Período: ${etiquetaPeriodo(r.periodo)} · Desde ${r.fechaInicio || 'inicio'} hasta ${r.fechaFin || 'hoy'} · Estado: ${etiquetaEstado(r.estado)}</p>

        <h2>Resumen Financiero</h2>
        <div class="resumen-grid">
            <div class="caja"><span class="lbl">Ventas de Contado (Efectivo)</span><span class="val">${formatearMoneda(r.ingresosContado)}</span></div>
            <div class="caja"><span class="lbl">Gastos (Insumos)</span><span class="val">${formatearMoneda(r.totalGastos)}</span></div>
            <div class="caja"><span class="lbl">Total a Pagar a Personal</span><span class="val">${formatearMoneda(r.totalAPagar)}</span></div>
            <div class="caja"><span class="lbl">Adelantos (Salida de Caja)</span><span class="val">${formatearMoneda(r.totalAdelantos)}</span></div>
            <div class="caja ${claseUtilidad}"><span class="lbl">Utilidad Neta</span><span class="val">${formatearMoneda(r.utilidadNeta)}</span></div>
        </div>
        <p class="nota">Utilidad = Ventas de Contado − Gastos (Insumos) − Total Adelantos Entregados.<br>
            Los fiados y abonos no alteran esta fórmula: se basa en el efectivo real que entró y salió de caja.<br>
            Detalle Personal — Salario Total: <b>${formatearMoneda(r.totalPagosPersonal)}</b> · Adelantos (salida de efectivo real): <b>${formatearMoneda(r.totalAdelantos)}</b></p>

        <h2>Pagos por Trabajador</h2>
        <table>
            <thead><tr><th>Trabajador</th><th class="num">Salario Total</th><th class="num">Adelantos</th><th class="num">Total a Pagar</th></tr></thead>
            <tbody>${pagosHtml}</tbody>
        </table>

        <h2>Detalle de Ventas</h2>
        <table>
            <tbody>
                <tr><td>Ventas de Contado (Efectivo)</td><td class="num">${formatearMoneda(r.totalContado)}</td></tr>
                <tr><td>Fiado / Crédito</td><td class="num">${formatearMoneda(r.totalCredito)}</td></tr>
                <tr><td>Abonos recibidos</td><td class="num">${formatearMoneda(r.totalAbonos)}</td></tr>
                <tr><td>Pendiente de cobro</td><td class="num">${formatearMoneda(r.totalPendiente)}</td></tr>
                <tr><td>Total Facturado</td><td class="num">${formatearMoneda(r.totalFacturado)}</td></tr>
                <tr><td>Fundas vendidas</td><td class="num">${r.totalFundas} fundas</td></tr>
            </tbody>
        </table>

        <h2>Mejores Clientes</h2>
        <table>
            <thead><tr><th>#</th><th>Cliente</th><th class="num">Fundas</th></tr></thead>
            <tbody>${clientesHtml}</tbody>
        </table>

        <p class="pie">Documento generado el ${new Date().toLocaleString('es-EC')} · Panadería Familiar</p>
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

    const MARGEN = 20;
    const ANCHO = 170;
    const LIMITE = 282;
    const NEGRO = [15, 23, 42];
    const GRIS = [100, 116, 139];
    const GRIS_SUAVE = [156, 163, 175];
    const LINEA = [209, 213, 219];
    const RELLENO = [243, 244, 246];
    let y = 26;

    function avanza(alto) {
        y += alto;
        if (y > LIMITE) {
            pdf.addPage();
            y = 26;
        }
    }

    function encabezadoSeccion(titulo) {
        avanza(6);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(...GRIS);
        pdf.text(String(titulo).toUpperCase(), MARGEN, y);
        y += 2.6;
        pdf.setDrawColor(...LINEA);
        pdf.setLineWidth(0.4);
        pdf.line(MARGEN, y, MARGEN + ANCHO, y);
        avanza(7);
    }

    function textoFlujo(texto, opciones = {}) {
        const { size = 9, estilo = 'normal', color = NEGRO, maxAncho = ANCHO } = opciones;
        pdf.setFont('helvetica', estilo);
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
        pdf.splitTextToSize(String(texto), maxAncho).forEach((linea) => {
            if (y > LIMITE) {
                pdf.addPage();
                y = 26;
            }
            pdf.text(linea, MARGEN, y);
            y += size / 3 + 1.4;
        });
    }

    function tabla(columnas, filas, opciones = {}) {
        const anchos = opciones.anchos || [];
        const alinear = opciones.alinear || [];
        const filaAlto = 7.2;

        function dibujarEncabezado() {
            pdf.setFillColor(...RELLENO);
            pdf.rect(MARGEN, y, ANCHO, filaAlto, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7.5);
            pdf.setTextColor(...GRIS);
            let x = MARGEN;
            columnas.forEach((titulo, i) => {
                const ancho = anchos[i] || ANCHO / columnas.length;
                if (alinear[i] === 'right') {
                    pdf.text(String(titulo).toUpperCase(), x + ancho, y + 4.8, { align: 'right' });
                } else {
                    pdf.text(String(titulo).toUpperCase(), x + 1.5, y + 4.8);
                }
                x += ancho;
            });
            y += filaAlto;
        }

        if (y + filaAlto > LIMITE) {
            pdf.addPage();
            y = 26;
        }
        dibujarEncabezado();

        filas.forEach((fila) => {
            if (y + filaAlto > LIMITE) {
                pdf.addPage();
                y = 26;
                dibujarEncabezado();
            }
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(...NEGRO);
            let xf = MARGEN;
            fila.forEach((celda, i) => {
                const ancho = anchos[i] || ANCHO / columnas.length;
                const linea = pdf.splitTextToSize(String(celda), ancho - 3)[0] || '';
                if (alinear[i] === 'right') {
                    pdf.text(linea, xf + ancho, y + 4.6, { align: 'right' });
                } else {
                    pdf.text(linea, xf + 1.5, y + 4.6);
                }
                xf += ancho;
            });
            pdf.setDrawColor(...LINEA);
            pdf.setLineWidth(0.2);
            pdf.line(MARGEN, y + filaAlto, MARGEN + ANCHO, y + filaAlto);
            y += filaAlto;
        });
        y += 3;
    }

    /* ---------- Encabezado del documento ---------- */
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.setTextColor(...NEGRO);
    pdf.text('Reporte Financiero', MARGEN, y);
    avanza(7);
    textoFlujo('Panadería Familiar', { size: 10, color: GRIS });
    textoFlujo(`Período: ${etiquetaPeriodo(r.periodo)}  ·  Desde ${r.fechaInicio || 'inicio'} hasta ${r.fechaFin || 'hoy'}  ·  Estado: ${etiquetaEstado(r.estado)}`, { size: 8.5, color: GRIS });
    y += 2;
    pdf.setDrawColor(...LINEA);
    pdf.setLineWidth(0.6);
    pdf.line(MARGEN, y, MARGEN + ANCHO, y);
    avanza(4);

    /* ---------- Resumen Financiero ---------- */
    encabezadoSeccion('Resumen Financiero');
    const itemsResumen = [
        ['Ventas de Contado (Efectivo)', formatearMoneda(r.ingresosContado)],
        ['Gastos (Insumos)', formatearMoneda(r.totalGastos)],
        ['Total a Pagar a Personal', formatearMoneda(r.totalAPagar)],
        ['Adelantos (Salida de Caja)', formatearMoneda(r.totalAdelantos)],
        ['Utilidad Neta', formatearMoneda(r.utilidadNeta)]
    ];
    const gap = 3;
    const boxAncho = (ANCHO - gap * 4) / 5;
    itemsResumen.forEach(([etiqueta, valor], i) => {
        const x = MARGEN + i * (boxAncho + gap);
        pdf.setFillColor(...RELLENO);
        pdf.roundedRect(x, y, boxAncho, 18, 1.5, 1.5, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5);
        pdf.setTextColor(...GRIS);
        pdf.splitTextToSize(etiqueta.toUpperCase(), boxAncho - 4).slice(0, 2).forEach((ln, k) => {
            pdf.text(ln, x + 2, y + 5 + k * 3);
        });
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(...NEGRO);
        pdf.text(valor, x + boxAncho / 2, y + 13.5, { align: 'center' });
    });
    avanza(22);

    const nota = `Utilidad = Ventas de Contado − Gastos (Insumos) − Total Adelantos Entregados.\n` +
        `Los fiados y abonos no alteran esta fórmula: se basa en el efectivo real que entró y salió de caja.\n` +
        `Detalle Personal — Salario Total: ${formatearMoneda(r.totalPagosPersonal)}  ·  Adelantos (salida de efectivo real): ${formatearMoneda(r.totalAdelantos)}`;
    textoFlujo(nota, { size: 8, color: GRIS });

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
        { anchos: [86, 28, 28, 28], alinear: ['left', 'right', 'right', 'right'] }
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
        { anchos: [100, 70], alinear: ['left', 'right'] }
    );

    /* ---------- Mejores Clientes ---------- */
    encabezadoSeccion('Mejores Clientes');
    const clientesFilas = (r.clientes || []).length > 0
        ? r.clientes.map(([cli, fundas], index) => [String(index + 1), cli, `${fundas} fundas`])
        : [['', 'Sin datos en el rango seleccionado', '']];
    tabla(
        ['#', 'Cliente', 'Fundas'],
        clientesFilas,
        { anchos: [15, 110, 45], alinear: ['left', 'left', 'right'] }
    );

    /* ---------- Pie y numeración ---------- */
    textoFlujo(`Documento generado el ${new Date().toLocaleString('es-EC')} · Panadería Familiar`, { size: 8, color: GRIS_SUAVE });

    const totalPaginas = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= totalPaginas; i++) {
        pdf.setPage(i);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...GRIS_SUAVE);
        pdf.text(`Página ${i} de ${totalPaginas}`, 210 - MARGEN, 290, { align: 'right' });
        pdf.text('Panadería Familiar', MARGEN, 290);
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
