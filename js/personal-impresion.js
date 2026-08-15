import { renderizarReportePersonalHtml, formatearMoneda, etiquetaTipo, montoConSigno } from './personal-impresion-render.js';

const CLAVE_REPORTE = 'panaderia:reporte-personal-actual';
const params = new URLSearchParams(location.search);
const accionAuto = params.get('accion');

const LOGO_URL = 'img/icono.jpg';
const ALTO_LOGO_MM = 15;

const estadoMensaje = document.getElementById('estadoMensaje');
const reporteDocumento = document.getElementById('reporteDocumento');
const btnImprimir = document.getElementById('btnImprimir');
const btnDescargar = document.getElementById('btnDescargar');
const btnVolver = document.getElementById('btnVolver');
const btnIrPersonal = document.getElementById('btnIrPersonal');

let logoDataUrl = null;
const promesaLogo = (async () => {
    try {
        const respuesta = await fetch(LOGO_URL);
        if (!respuesta.ok) return null;
        const blob = await respuesta.blob();
        return await new Promise((resolve) => {
            const lector = new FileReader();
            lector.onload = () => resolve(lector.result);
            lector.onerror = () => resolve(null);
            lector.readAsDataURL(blob);
        });
    } catch (e) {
        return null;
    }
})();
promesaLogo.then((dataUrl) => { logoDataUrl = dataUrl; });

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

    reporteDocumento.innerHTML = renderizarReportePersonalHtml(r);

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

async function descargarPdf() {
    const r = obtenerReporte();
    if (!r) return;

    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
        alert('La librería de PDF no cargó. Revisa tu conexión e inténtalo de nuevo.');
        return;
    }

    await promesaLogo;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const MARGEN = 10;
    const ANCHO = 190;
    const MARGEN_SUP = 20;
    const MARGEN_INF = 10;
    const LIMITE = 280;
    const NEGRO = [0, 0, 0];
    const GRIS = [70, 70, 70];
    const GRIS_SUAVE = [110, 110, 110];
    const CABECERA = [236, 238, 241];
    let currentY = MARGEN_SUP;

    function avanza(alto) {
        currentY += alto;
        if (currentY > LIMITE) {
            pdf.addPage();
            currentY = MARGEN_SUP;
        }
    }

    function encabezadoSeccion(titulo) {
        avanza(6.5);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(...NEGRO);
        pdf.text(String(titulo).toUpperCase(), MARGEN, currentY);
        currentY += 2.4;
        pdf.setDrawColor(...NEGRO);
        pdf.setLineWidth(0.5);
        pdf.line(MARGEN, currentY, MARGEN + ANCHO, currentY);
        currentY += 4;
    }

    function textoFlujo(texto, opciones = {}) {
        const { size = 8, estilo = 'normal', color = NEGRO, maxAncho = ANCHO } = opciones;
        pdf.setFont('helvetica', estilo);
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
        pdf.splitTextToSize(String(texto), maxAncho).forEach((linea) => {
            if (currentY > LIMITE) {
                pdf.addPage();
                currentY = MARGEN_SUP;
            }
            pdf.text(linea, MARGEN, currentY);
            currentY += size / 3 + 1.4;
        });
    }

    function tabla(columnas, filas, opciones = {}) {
        const anchos = opciones.anchos || [];
        const alinear = opciones.alinear || [];
        const altoCabecera = 7;
        const altoBase = 5.6;
        const destacarUltima = opciones.destacarUltima === true;

        function lineasCelda(celda, i) {
            const ancho = anchos[i] || ANCHO / columnas.length;
            return pdf.splitTextToSize(String(celda), ancho - 3);
        }

        function alturaFila(fila) {
            let maxLineas = 1;
            fila.forEach((celda, i) => {
                const n = lineasCelda(celda, i).length;
                if (n > maxLineas) maxLineas = n;
            });
            return Math.max(altoBase, maxLineas * 4.2 + 1.6);
        }

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
                lineasCelda(celda, i).forEach((linea, li) => {
                    const yLinea = yRow + 3.2 + li * 4.2;
                    if (alinear[i] === 'right') {
                        pdf.text(linea, x + ancho - 1.5, yLinea, { align: 'right' });
                    } else {
                        pdf.text(linea, x + 1.5, yLinea);
                    }
                });
                x += ancho;
            });
        }

        if (currentY + altoCabecera > LIMITE) {
            pdf.addPage();
            currentY = MARGEN_SUP;
        }
        dibujarFila(columnas, currentY, altoCabecera, { relleno: true, superior: 0.6, inferior: 0.6, estilo: 'bold' });
        currentY += altoCabecera;

        filas.forEach((fila, idx) => {
            const alto = alturaFila(fila);
            if (currentY + alto > LIMITE) {
                pdf.addPage();
                currentY = MARGEN_SUP;
                dibujarFila(columnas, currentY, altoCabecera, { relleno: true, superior: 0.6, inferior: 0.6, estilo: 'bold' });
                currentY += altoCabecera;
            }
            const esUltima = destacarUltima && idx === filas.length - 1;
            dibujarFila(fila, currentY, alto, {
                superior: esUltima ? 1 : 0.3,
                estilo: esUltima ? 'bold' : 'normal'
            });
            currentY += alto;
        });
        currentY += 2.5;
    }

    /* ---------- Cabecera corporativa ---------- */
    let anchoLogo = 0;
    if (logoDataUrl) {
        try {
            const props = pdf.getImageProperties(logoDataUrl);
            anchoLogo = ALTO_LOGO_MM * (props.width / props.height);
        } catch (e) {
            anchoLogo = ALTO_LOGO_MM;
        }
        pdf.addImage(logoDataUrl, 'JPEG', MARGEN, currentY, anchoLogo, ALTO_LOGO_MM);
    }
    const xTexto = MARGEN + anchoLogo + 4;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(...NEGRO);
    pdf.text('Panadería El Vacán', xTexto, currentY + 6.4);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...GRIS);
    pdf.text('Documento de Personal', xTexto, currentY + 10.4);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(...NEGRO);
    pdf.text('Reporte de Empleados y Adelantos', MARGEN + ANCHO, currentY + 7.4, { align: 'right' });

    /* Línea divisoria sólida */
    currentY += ALTO_LOGO_MM + 4;
    pdf.setDrawColor(...NEGRO);
    pdf.setLineWidth(1.1);
    pdf.line(MARGEN, currentY, MARGEN + ANCHO, currentY);
    currentY += 5;

    /* ---------- Metadatos ---------- */
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...GRIS);
    pdf.text(`Trabajador: ${r.etiquetaTrabajador || 'Todos los empleados'}`, MARGEN, currentY);
    pdf.text(`Período: ${r.etiquetaPeriodo || ''}`, MARGEN, currentY + 3.6);
    pdf.text(`Generado: ${new Date().toLocaleString('es-EC')}`, MARGEN + ANCHO, currentY + 1.8, { align: 'right' });
    currentY += 7.2;

    /* ---------- Balance por trabajador ---------- */
    encabezadoSeccion('Balance por trabajador');
    const resumenFilas = (r.resumenes || []).length > 0
        ? r.resumenes.map((f) => [
            f.nombre,
            String(f.movimientos),
            formatearMoneda(f.adelantos),
            formatearMoneda(f.pagos),
            formatearMoneda(f.balance)
        ])
        : [['Sin datos en el rango seleccionado', '', '', '', '']];
    tabla(
        ['Trabajador', 'Mov.', 'Adelantos', 'Salario Total', 'Total a Pagar'],
        resumenFilas,
        { anchos: [81, 17, 31, 31, 30], alinear: ['left', 'right', 'right', 'right', 'right'] }
    );

    currentY += 3;

    textoFlujo(`Total a Pagar = Salario Total - Adelantos. Totales del período - Salario: ${formatearMoneda(r.totalPagos)} · Adelantos: ${formatearMoneda(r.totalAdelantos)} · Neto a Pagar: ${formatearMoneda(r.totalAPagar)}`, { size: 7.5, color: GRIS });

    currentY += 3;

    /* ---------- Detalle de movimientos ---------- */
    encabezadoSeccion('Detalle de movimientos');
    const detalleFilas = (r.detalle || []).length > 0
        ? r.detalle.map((mv) => [
            mv.fechaTexto || '-',
            mv.trabajador,
            etiquetaTipo(mv.tipo),
            mv.concepto || '-',
            montoConSigno(mv.tipo, mv.monto)
        ])
        : [['Sin movimientos en el rango seleccionado', '', '', '', '']];
    tabla(
        ['Fecha', 'Trabajador', 'Tipo', 'Concepto', 'Monto'],
        detalleFilas,
        { anchos: [26, 35, 22, 65, 42], alinear: ['left', 'left', 'left', 'left', 'right'] }
    );

    /* ---------- Pie y numeración ---------- */
    const totalPaginas = pdf.internal.getNumberOfPages();
    const yPie = 297 - MARGEN_INF;
    for (let i = 1; i <= totalPaginas; i++) {
        pdf.setPage(i);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(...GRIS_SUAVE);
        pdf.text('Panadería El Vacán · Reporte de Empleados y Adelantos', MARGEN, yPie);
        pdf.text(`Página ${i} de ${totalPaginas}`, 210 - MARGEN, yPie, { align: 'right' });
    }

    const nombreArchivo = `reporte-personal-${r.inicio || 'inicio'}-a-${r.fin || 'hoy'}.pdf`;
    pdf.save(nombreArchivo);
}

btnImprimir.addEventListener('click', imprimirDocumento);
btnDescargar.addEventListener('click', descargarPdf);
btnVolver.addEventListener('click', () => { location.href = 'personal.html'; });
btnIrPersonal.addEventListener('click', () => { location.href = 'personal.html'; });

pintarDocumento();

if (accionAuto === 'descargar' && obtenerReporte()) {
    (async () => {
        await esperarJsPDF();
        if (typeof window.jspdf !== 'undefined') {
            await descargarPdf();
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
