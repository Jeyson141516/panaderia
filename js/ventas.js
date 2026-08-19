import { db, getDocsSafe } from './firebase-config.js';
import { collection, addDoc, query, where, limit, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast, escapeHtml } from './ui.js';
import { normalizarTexto, limpiarTexto, validarEntero, validarMonto, validarTelefono, ejecutarConBotonBloqueado, conTimeout, leerCache, guardarCache, esCoincidenciaFuzzy } from './utils.js';
import { cargarDeudores, obtenerDeudores, actualizarBadgeVentas } from './deudores.js';

const PRECIO_FUNDA = 1.00;

const cantidadInput = document.getElementById('cantidad');
const totalPagarSpan = document.getElementById('totalPagar');
const formVenta = document.getElementById('formVenta');
const clienteBusqueda = document.getElementById('clienteBusqueda');
const listaSugerencias = document.getElementById('listaSugerencias');
const saldoInfo = document.getElementById('clienteSaldoInfo');
const saldoInfoText = document.getElementById('clienteSaldoText');
const btnAbonoSaldo = document.getElementById('btnAbonoSaldo');
const estadoPagoSelect = document.getElementById('estadoPago');
const fechaVentaSelect = document.getElementById('fechaVenta');
const ventasDiaTitulo = document.getElementById('ventasDiaTitulo');

const btnAbrirModal = document.getElementById('btnAbrirModal');
const modalCliente = document.getElementById('modalCliente');
const cerrarModal = document.getElementById('cerrarModal');
const guardarClienteModal = document.getElementById('guardarClienteModal');
const nuevoNombreInput = document.getElementById('nuevoNombre');
const nuevoTelefonoInput = document.getElementById('nuevoTelefono');

const tablaVentasPagado = document.getElementById('tablaVentasPagado');
const tablaVentasDebe = document.getElementById('tablaVentasDebe');
const buscadorVentasDia = document.getElementById('buscadorVentasDia');
const fechaFiltroDia = document.getElementById('fechaFiltroDia');
const botonesRapidosDia = Array.from(document.querySelectorAll('.btn-rapido-dia'));
const totalDiaContado = document.getElementById('totalDiaContado');
const ventasDiaCache = [];
let saldosMap = {};
let saldosNormMap = {};

function offsetDiasSeleccionado() {
    return parseInt(fechaVentaSelect.value, 10) || 0;
}

function fechaHoyLocal() {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
}

function fechaOffsetLocal(dias) {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function marcarRapidoDiaActivo(fecha) {
    botonesRapidosDia.forEach((btn) => {
        const dias = parseInt(btn.dataset.dias, 10) || 0;
        btn.classList.toggle('activo', fecha === fechaOffsetLocal(dias));
    });
}

function desmarcarRapidosDia() {
    botonesRapidosDia.forEach((btn) => btn.classList.remove('activo'));
}

function aplicarRapidoDia(btn) {
    const dias = parseInt(btn.dataset.dias, 10) || 0;
    fechaFiltroDia.value = fechaOffsetLocal(dias);
    botonesRapidosDia.forEach((b) => b.classList.toggle('activo', b === btn));
    localStorage.setItem(CLAVE_DIA_CONSULTA, fechaFiltroDia.value);
    localStorage.setItem(CLAVE_MODO_DIA_CONSULTA, String(dias));
    cargarVentasDelDia();
}

botonesRapidosDia.forEach((btn) => btn.addEventListener('click', () => aplicarRapidoDia(btn)));

function formatearFechaLocal(fecha) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function rangoDiaConsultado() {
    const dia = fechaFiltroDia.value || fechaHoyLocal();
    const [anio, mes, diaNum] = dia.split('-').map(Number);
    // Límites en hora LOCAL: 00:00:00.000 a 23:59:59.999 del día seleccionado.
    // El SDK de Firestore convierte estas fechas a su instante UTC equivalente,
    // por lo que el rango coincide con las marcas de tiempo guardadas (Timestamps).
    const inicio = new Date(anio, mes - 1, diaNum, 0, 0, 0, 0);
    const fin = new Date(anio, mes - 1, diaNum, 23, 59, 59, 999);
    return { dia, anio, mes: mes - 1, diaNum, inicio, fin };
}

function formatearMoneda(valor) {
    return `$${Number(valor).toFixed(2)}`;
}

function formatearHora(fecha) {
    return `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
}

function renderTablaVentas(tbody, ventas, mensajeVacio) {
    if (ventas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-cell">${mensajeVacio}</td></tr>`;
        return;
    }

    tbody.innerHTML = ventas.map((v) => `
        <tr class="${v.esAbono ? 'abono-row' : ''}">
            <td>${v.esAbono ? '<span class="badge abono">Abono</span> ' : ''}${escapeHtml(v.cliente)}</td>
            <td>${v.esAbono ? '—' : v.cantidad}</td>
            <td class="monto-cell">${formatearMoneda(v.total)}</td>
            <td>${v.hora}</td>
        </tr>`).join("");
}

function agruparPendientes(pendientes) {
    const mapa = new Map();
    pendientes.forEach((p) => {
        const fila = mapa.get(p.cliente) || { cliente: p.cliente, saldo: 0, ultimaHora: p.hora };
        fila.saldo = Math.max(0, saldosMap[p.cliente] || 0);
        if (p.hora > fila.ultimaHora) fila.ultimaHora = p.hora;
        mapa.set(p.cliente, fila);
    });
    return [...mapa.values()].sort((a, b) => b.saldo - a.saldo);
}

function renderDebe(pendientes) {
    if (pendientes.length === 0) {
        tablaVentasDebe.innerHTML = '<tr><td colspan="4" class="empty-cell">No hay deudas pendientes en el período seleccionado. Todo al día.</td></tr>';
        return;
    }

    tablaVentasDebe.innerHTML = pendientes.map((r) => {
        const accion = r.saldo > 0
            ? `<button type="button" class="btn-accion btn-abonar" data-cliente="${escapeHtml(r.cliente)}">Abonar</button>`
            : '<span class="badge pago">Pagado</span>';
        return `
        <tr>
            <td>${escapeHtml(r.cliente)}</td>
            <td class="monto-cell saldo-cell">${formatearMoneda(r.saldo)}</td>
            <td>${r.ultimaHora}</td>
            <td class="actions-cell">${accion}</td>
        </tr>`;
    }).join("");
}

function renderVentasDia() {
    const pagadas = ventasDiaCache.filter((v) => v.estado === 'pagado');
    const abonos = ventasDiaCache.filter((v) => v.estado === 'abono');
    const pendientes = ventasDiaCache.filter((v) => v.estado === 'debe');

    renderTablaVentas(
        tablaVentasPagado,
        [...pagadas, ...abonos.map((a) => ({ ...a, esAbono: true }))],
        'Aún no hay pagos recibidos en el período seleccionado.'
    );
    renderDebe(agruparPendientes(pendientes));
    aplicarFiltroBuscadorVentas();
}

function aplicarFiltroBuscadorVentas() {
    const termino = normalizarTexto(buscadorVentasDia.value);
    const mensaje = `Sin resultados para "${buscadorVentasDia.value.trim()}".`;

    [tablaVentasPagado, tablaVentasDebe].forEach((tbody) => {
        tbody.querySelectorAll('tr.sin-resultados').forEach((tr) => tr.remove());

        const filas = [...tbody.querySelectorAll('tr')];
        let visibles = 0;

        filas.forEach((tr) => {
            const coincide = esCoincidenciaFuzzy(tr.textContent, buscadorVentasDia.value);
            tr.style.display = coincide ? '' : 'none';
            if (coincide) visibles++;
        });

        if (termino !== '' && visibles === 0) {
            const tr = document.createElement('tr');
            tr.className = 'sin-resultados';
            tr.innerHTML = `<td colspan="4" class="empty-cell">${escapeHtml(mensaje)}</td>`;
            tbody.appendChild(tr);
        }
    });

    actualizarContadorDia();
}

/**
 * Contador en tiempo real del total cobrado.
 * Suma ventas de contado (estado 'pagado') Y abonos (estado 'abono').
 * Excluye fiados ('debe'). Respeta el buscador activo: si el usuario filtra,
 * el total refleja solo las filas visibles.
 */
function actualizarContadorDia() {
    let total = 0;

    ventasDiaCache.forEach((v) => {
        if (v.estado !== 'pagado' && v.estado !== 'abono') return;
        if (!esCoincidenciaFuzzy(v.cliente, buscadorVentasDia.value)) return;
        total += v.total;
    });

    if (totalDiaContado) {
        totalDiaContado.textContent = formatearMoneda(total);
    }
}

buscadorVentasDia.addEventListener('input', aplicarFiltroBuscadorVentas);

async function cargarSaldos() {
    const { lista, mapaNorm } = await cargarDeudores();
    saldosMap = {};
    saldosNormMap = mapaNorm;
    lista.forEach(({ cliente, saldo }) => {
        saldosMap[cliente] = saldo;
    });
    actualizarBadgeVentas();
    actualizarAlertaDeudores();
}

function actualizarAlertaDeudores() {
    const alerta = document.getElementById('alertaDeudores');
    const contador = document.getElementById('alertaDeudoresContador');
    if (!alerta || !contador) return;
    const total = obtenerDeudores().total;
    contador.textContent = String(total);
    alerta.classList.toggle('hidden', total === 0);
}

async function cargarVentasDelDia() {
    try {
        const { anio, mes, diaNum, inicio, fin } = rangoDiaConsultado();
        ventasDiaTitulo.textContent = `Ventas del Día (${formatearFechaLocal(inicio)})`;

        const [querySnapshot] = await Promise.all([
            getDocsSafe(
                query(collection(db, "ventas"),
                    where("fecha", ">=", inicio),
                    where("fecha", "<=", fin),
                    orderBy("fecha", "desc"))
            ),
            cargarSaldos()
        ]);

        ventasDiaCache.length = 0;

        querySnapshot.forEach((docSnap) => {
            const v = docSnap.data();
            const fecha = v.fecha && v.fecha.toDate ? v.fecha.toDate() : null;

            // Filtro de seguridad anti desfase horario: se valida el año, mes y
            // día LOCALES del Timestamp guardado en Firestore, descartando
            // cualquier documento que el rango de servidor haya incluido por borde.
            if (fecha && (fecha.getFullYear() !== anio || fecha.getMonth() !== mes || fecha.getDate() !== diaNum)) {
                return;
            }

            ventasDiaCache.push({
                cliente: v.cliente || "Cliente General",
                cantidad: Number(v.cantidadFundas) || 0,
                total: Number(v.totalVenta) || 0,
                estado: v.estadoPago || "pagado",
                hora: fecha ? formatearHora(fecha) : "--:--"
            });
        });

        renderVentasDia();
    } catch (error) {
        console.error("Error cargando ventas del día:", error);
        tablaVentasPagado.innerHTML = '<tr><td colspan="4" class="empty-cell">No se pudieron cargar las ventas del día.</td></tr>';
        tablaVentasDebe.innerHTML = '<tr><td colspan="4" class="empty-cell">No se pudieron cargar las ventas del día.</td></tr>';
    }
}

function actualizarTotalVenta() {
    const cantidad = parseInt(cantidadInput.value, 10);
    const total = Number.isFinite(cantidad) && cantidad > 0 && cantidad <= 999 ? cantidad * PRECIO_FUNDA : 0;
    totalPagarSpan.textContent = total.toFixed(2);
}

cantidadInput.addEventListener('input', actualizarTotalVenta);

const CLAVE_DIA_CONSULTA = 'panaderia-dia-consulta';
const CLAVE_MODO_DIA_CONSULTA = 'panaderia-dia-consulta-modo';

function restaurarDiaConsultado() {
    const guardado = localStorage.getItem(CLAVE_DIA_CONSULTA);
    const modoGuardado = localStorage.getItem(CLAVE_MODO_DIA_CONSULTA);
    const valido = guardado && /^\d{4}-\d{2}-\d{2}$/.test(guardado);
    fechaFiltroDia.value = modoGuardado === '0' || !modoGuardado
        ? fechaHoyLocal()
        : (valido ? guardado : fechaHoyLocal());
    marcarRapidoDiaActivo(fechaFiltroDia.value);
}

fechaFiltroDia.addEventListener('change', () => {
    // Solo se toca el valor cuando el campo quedó vacío (fallback a hoy).
    // Una fecha elegida por el usuario se conserva tal cual y se persiste.
    if (!fechaFiltroDia.value) {
        fechaFiltroDia.value = fechaHoyLocal();
    }
    desmarcarRapidosDia();
    localStorage.setItem(CLAVE_DIA_CONSULTA, fechaFiltroDia.value);
    localStorage.setItem(CLAVE_MODO_DIA_CONSULTA, 'manual');
    cargarVentasDelDia();
});

/* ---------- Modal de registro de abono (cuenta por cobrar) ---------- */
const modalAbono = document.getElementById('modalAbono');
const abonoClienteNombre = document.getElementById('abonoClienteNombre');
const abonoDeudaVigente = document.getElementById('abonoDeudaVigente');
const abonoNuevoSaldo = document.getElementById('abonoNuevoSaldo');
const montoAbonoInput = document.getElementById('montoAbono');
const cerrarModalAbono = document.getElementById('cerrarModalAbono');
const cancelarModalAbono = document.getElementById('cancelarModalAbono');
const guardarPagoModal = document.getElementById('guardarPagoModal');

let abonoClienteSeleccionado = null;
let abonoDeudaActual = 0;

function actualizarSaldoRestante() {
    const monto = validarMonto(montoAbonoInput.value, 0.01, 1000000);
    const abonado = monto !== null ? monto : 0;
    const restante = Math.max(0, abonoDeudaActual - abonado);
    abonoNuevoSaldo.textContent = formatearMoneda(restante);
    abonoNuevoSaldo.classList.toggle('al-dia', restante === 0);
}

function abrirModalAbono(cliente) {
    const info = saldosNormMap[normalizarTexto(cliente)];
    abonoClienteSeleccionado = info ? info.nombre : cliente;
    abonoDeudaActual = Math.max(0, info ? info.saldo : 0);
    abonoClienteNombre.textContent = abonoClienteSeleccionado;
    abonoDeudaVigente.textContent = formatearMoneda(abonoDeudaActual);
    montoAbonoInput.value = '';
    if (abonoDeudaActual > 0) {
        montoAbonoInput.max = abonoDeudaActual;
    } else {
        montoAbonoInput.removeAttribute('max');
    }
    actualizarSaldoRestante();
    modalAbono.style.display = 'flex';
    montoAbonoInput.focus();
}

function cerrarModalAbonoHandler() {
    modalAbono.style.display = 'none';
    abonoClienteSeleccionado = null;
    abonoDeudaActual = 0;
}

montoAbonoInput.addEventListener('input', actualizarSaldoRestante);

cerrarModalAbono.addEventListener('click', cerrarModalAbonoHandler);
cancelarModalAbono.addEventListener('click', cerrarModalAbonoHandler);
modalAbono.addEventListener('click', (e) => {
    if (e.target === modalAbono) cerrarModalAbonoHandler();
});

montoAbonoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        guardarPagoModal.click();
    }
});

guardarPagoModal.addEventListener('click', () => {
    ejecutarConBotonBloqueado(guardarPagoModal, async () => {
        const monto = validarMonto(montoAbonoInput.value, 0.01, 1000000);
        if (monto === null) {
            toast("Ingresa un monto de abono válido.", "warning");
            return;
        }

        try {
            await conTimeout(addDoc(collection(db, "ventas"), {
                cliente: abonoClienteSeleccionado,
                cantidadFundas: 0,
                totalVenta: monto,
                estadoPago: 'abono',
                montoAbono: monto,
                fecha: new Date()
            }), 3000);
        } catch (error) {
            if (error.message !== 'timeout') {
                console.error("Error al registrar el abono:", error);
                toast("Hubo un error al guardar el pago.", "error");
                return;
            }
        }

        cerrarModalAbonoHandler();
        toast("¡Pago registrado! Deuda actualizada.");
        cargarVentasDelDia().catch(() => {});
    });
});

function prepararAbono(cliente) {
    abrirModalAbono(cliente);
}

tablaVentasDebe.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-abonar');
    if (!btn) return;
    prepararAbono(btn.dataset.cliente);
});

/* ---------- Modal de advertencia por venta duplicada (mismo cliente, mismo día) ---------- */
const modalVentaDuplicada = document.getElementById('modalVentaDuplicada');
const duplicadaClienteNombre = document.getElementById('duplicadaClienteNombre');
const duplicadaAcumuladoHoy = document.getElementById('duplicadaAcumuladoHoy');
const cerrarModalDuplicada = document.getElementById('cerrarModalDuplicada');
const cancelarModalDuplicada = document.getElementById('cancelarModalDuplicada');
const confirmarModalDuplicada = document.getElementById('confirmarModalDuplicada');

let ventaPendienteDuplicada = null;

function rangoHoyLocal() {
    const hoy = new Date();
    return {
        anio: hoy.getFullYear(),
        mes: hoy.getMonth(),
        dia: hoy.getDate(),
        inicio: new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0),
        fin: new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999)
    };
}

/**
 * Cuenta las ventas de HOY (fecha actual) de un cliente y el monto acumulado.
 * Ignora el día seleccionado en el formulario: la verificación es siempre
 * contra la fecha actual.
 */
async function obtenerVentasDeHoyCliente(cliente) {
    const { anio, mes, dia, inicio, fin } = rangoHoyLocal();
    const clienteNorm = normalizarTexto(cliente);

    const snapshot = await getDocsSafe(query(
        collection(db, "ventas"),
        where("fecha", ">=", inicio),
        where("fecha", "<=", fin)
    ));

    let ventas = 0;
    let total = 0;

    snapshot.forEach((docSnap) => {
        const v = docSnap.data();
        const fecha = v.fecha && v.fecha.toDate ? v.fecha.toDate() : null;

        if (fecha && (fecha.getFullYear() !== anio || fecha.getMonth() !== mes || fecha.getDate() !== dia)) {
            return;
        }
        if (normalizarTexto(v.cliente) !== clienteNorm) return;

        ventas += 1;
        total += Number(v.totalVenta) || 0;
    });

    return { ventas, total };
}

function abrirModalVentaDuplicada(cliente, acumuladoHoy, onConfirmar) {
    duplicadaClienteNombre.textContent = cliente;
    duplicadaAcumuladoHoy.textContent = formatearMoneda(acumuladoHoy);
    ventaPendienteDuplicada = onConfirmar;
    modalVentaDuplicada.style.display = 'flex';
    confirmarModalDuplicada.focus();
}

function cerrarModalVentaDuplicada() {
    modalVentaDuplicada.style.display = 'none';
    ventaPendienteDuplicada = null;
}

cerrarModalDuplicada.addEventListener('click', cerrarModalVentaDuplicada);
cancelarModalDuplicada.addEventListener('click', cerrarModalVentaDuplicada);
modalVentaDuplicada.addEventListener('click', (e) => {
    if (e.target === modalVentaDuplicada) cerrarModalVentaDuplicada();
});

confirmarModalDuplicada.addEventListener('click', () => {
    const onConfirmar = ventaPendienteDuplicada;
    if (!onConfirmar) return;

    ejecutarConBotonBloqueado(confirmarModalDuplicada, async () => {
        cerrarModalVentaDuplicada();
        await onConfirmar();
    });
});

let clientesCache = [];
let indiceActivo = -1;
let clientesPromise = null;

const CACHE_CLIENTES = 'clientes';
const TTL_CLIENTES_MS = 30 * 60 * 1000;

function cargarClientes() {
    if (!clientesPromise) {
        // Sirve la lista guardada al instante (autocompletado inmediato)
        // mientras se refresca en segundo plano desde Firestore.
        const cacheado = leerCache(CACHE_CLIENTES, TTL_CLIENTES_MS);
        if (cacheado) clientesCache = cacheado;

        clientesPromise = getDocsSafe(collection(db, "clientes"))
            .then((querySnapshot) => {
                clientesCache = querySnapshot.docs
                    .map((docSnap) => {
                        const nombre = String(docSnap.data().nombre || "").trim();
                        return {
                            id: docSnap.id,
                            nombre,
                            nombreNorm: normalizarTexto(nombre)
                        };
                    })
                    .filter((c) => c.nombre.length > 0);

                clientesCache.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
                guardarCache(CACHE_CLIENTES, clientesCache);
            })
            .catch((error) => {
                console.error("Error cargando clientes:", error);
                clientesPromise = null; // permite reintentar en la próxima escritura
                if (clientesCache.length === 0) throw error;
            });
    }
    return clientesPromise;
}

function cerrarSugerencias() {
    listaSugerencias.style.display = 'none';
    indiceActivo = -1;
}

let clienteSaldoSeleccionado = null;
let debounceSaldoTimer = null;

function buscarClienteExacto(nombre) {
    const norm = normalizarTexto(nombre);
    return clientesCache.some((c) => c.nombreNorm === norm);
}

function ocultarInfoSaldo() {
    clienteSaldoSeleccionado = null;
    saldoInfo.classList.add('hidden');
}

function actualizarInfoSaldo(nombre) {
    const texto = (nombre || '').trim();
    if (!texto) {
        ocultarInfoSaldo();
        return;
    }

    const info = saldosNormMap[normalizarTexto(texto)];
    if (info) {
        clienteSaldoSeleccionado = info.nombre;
        const restante = Math.max(0, info.saldo);
        if (restante > 0) {
            saldoInfoText.textContent = `Saldo pendiente: ${formatearMoneda(restante)}`;
            saldoInfoText.className = 'saldo-info-text pendiente';
            btnAbonoSaldo.classList.remove('hidden');
        } else {
            saldoInfoText.textContent = 'Sin deudas pendientes';
            saldoInfoText.className = 'saldo-info-text al-dia';
            btnAbonoSaldo.classList.add('hidden');
        }
        saldoInfo.classList.remove('hidden');
    } else if (buscarClienteExacto(texto)) {
        clienteSaldoSeleccionado = texto;
        saldoInfoText.textContent = 'Sin deudas pendientes';
        saldoInfoText.className = 'saldo-info-text al-dia';
        btnAbonoSaldo.classList.add('hidden');
        saldoInfo.classList.remove('hidden');
    } else {
        ocultarInfoSaldo();
    }
}

btnAbonoSaldo.addEventListener('click', () => {
    if (clienteSaldoSeleccionado) prepararAbono(clienteSaldoSeleccionado);
});

function seleccionarCliente(nombre) {
    clienteBusqueda.value = nombre;
    cerrarSugerencias();
    actualizarInfoSaldo(nombre);
    clienteBusqueda.focus();
}

function actualizarResaltado() {
    listaSugerencias.querySelectorAll('li').forEach((li, i) => {
        li.classList.toggle('active', i === indiceActivo && !li.classList.contains('no-result'));
    });
}

clienteBusqueda.addEventListener('input', async (e) => {
    const texto = e.target.value.trim();
    indiceActivo = -1;

    if (texto.length === 0) {
        cerrarSugerencias();
        ocultarInfoSaldo();
        return;
    }

    try {
        await cargarClientes();
    } catch (error) {
        return; // sin lista local y sin red: no hay sugerencias disponibles
    }
    buscarClientes(texto);

    clearTimeout(debounceSaldoTimer);
    debounceSaldoTimer = setTimeout(() => actualizarInfoSaldo(texto), 300);
});

function buscarClientes(texto) {
    listaSugerencias.innerHTML = '';
    indiceActivo = -1;

    const coincidencias = [];
    clientesCache.forEach((cliente) => {
        if (esCoincidenciaFuzzy(cliente.nombre, texto)) {
            const info = saldosNormMap[cliente.nombreNorm];
            const saldo = info ? Math.max(0, info.saldo) : 0;
            coincidencias.push({
                nombre: cliente.nombre,
                saldo,
                conDeuda: saldo > 0
            });
        }
    });

    // Primero los clientes con saldo pendiente (de mayor a menor), luego el resto.
    coincidencias.sort((a, b) =>
        (b.conDeuda - a.conDeuda) || a.nombre.localeCompare(b.nombre, "es"));

    coincidencias.forEach((cliente, index) => {
        const li = document.createElement('li');
        li.dataset.nombre = cliente.nombre;
        if (cliente.conDeuda) {
            li.className = 'con-deuda';
            li.innerHTML = `${escapeHtml(cliente.nombre)}<span class="deuda-tag">Fiado ${formatearMoneda(cliente.saldo)}</span>`;
        } else {
            li.textContent = cliente.nombre;
        }
        li.addEventListener('click', () => seleccionarCliente(cliente.nombre));
        li.addEventListener('mouseenter', () => {
            indiceActivo = index;
            actualizarResaltado();
        });
        listaSugerencias.appendChild(li);
    });

    if (coincidencias.length === 0) {
        const li = document.createElement('li');
        li.className = 'no-result';
        li.textContent = 'No se encontró el cliente. Usa "+ Nuevo"';
        listaSugerencias.appendChild(li);
    }
    listaSugerencias.style.display = 'block';
}

clienteBusqueda.addEventListener('keydown', (e) => {
    if (listaSugerencias.style.display === 'none') return;

    const items = [...listaSugerencias.querySelectorAll('li')].filter((li) => !li.classList.contains('no-result'));
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        indiceActivo = indiceActivo < items.length - 1 ? indiceActivo + 1 : 0;
        actualizarResaltado();
        items[indiceActivo].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        indiceActivo = indiceActivo > 0 ? indiceActivo - 1 : items.length - 1;
        actualizarResaltado();
        items[indiceActivo].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
        e.preventDefault();
        seleccionarCliente(items[Math.max(indiceActivo, 0)].dataset.nombre);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        cerrarSugerencias();
    }
});

document.addEventListener('click', (e) => {
    if (!clienteBusqueda.contains(e.target) && !listaSugerencias.contains(e.target)) {
        cerrarSugerencias();
    }
});

btnAbrirModal.addEventListener('click', () => {
    modalCliente.style.display = 'flex';
    nuevoNombreInput.value = '';
    nuevoTelefonoInput.value = '';
    nuevoNombreInput.focus();
});

cerrarModal.addEventListener('click', cerrarModalHandler);
modalCliente.addEventListener('click', (e) => {
    if (e.target === modalCliente) cerrarModalHandler();
});

function cerrarModalHandler() {
    modalCliente.style.display = 'none';
}

const modalDeudores = document.getElementById('modalDeudores');
const btnVerDeudores = document.getElementById('btnVerDeudores');
const cerrarModalDeudores = document.getElementById('cerrarModalDeudores');
const tablaDeudores = document.getElementById('tablaDeudores');

function renderListaDeudores() {
    const { lista } = obtenerDeudores();
    if (!tablaDeudores) return;
    if (lista.length === 0) {
        tablaDeudores.innerHTML = '<tr><td colspan="3" class="empty-cell">No hay deudas pendientes. ¡Todo al día!</td></tr>';
        return;
    }
    tablaDeudores.innerHTML = lista.map(({ cliente, saldo }) => `
        <tr>
            <td>${escapeHtml(cliente)}</td>
            <td class="monto-cell saldo-cell">${formatearMoneda(saldo)}</td>
            <td class="actions-cell"><button type="button" class="btn-accion btn-abonar" data-cliente="${escapeHtml(cliente)}">Abonar</button></td>
        </tr>`).join('');
}

btnVerDeudores.addEventListener('click', () => {
    renderListaDeudores();
    modalDeudores.style.display = 'flex';
});

cerrarModalDeudores.addEventListener('click', () => { modalDeudores.style.display = 'none'; });
modalDeudores.addEventListener('click', (e) => {
    if (e.target === modalDeudores) modalDeudores.style.display = 'none';
});

modalDeudores.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-abonar');
    if (!btn) return;
    modalDeudores.style.display = 'none';
    prepararAbono(btn.dataset.cliente);
});

guardarClienteModal.addEventListener('click', () => {
    ejecutarConBotonBloqueado(guardarClienteModal, async () => {
        const nombre = limpiarTexto(nuevoNombreInput.value, 80);
        const telefono = validarTelefono(nuevoTelefonoInput.value);

        if (!nombre) {
            toast("Por favor escribe el nombre del cliente.", "warning");
            return;
        }

        const nombreNorm = normalizarTexto(nombre);

        let existente = null;
        try {
            existente = await getDocsSafe(query(collection(db, "clientes"), where("nombreNorm", "==", nombreNorm), limit(1)));
        } catch (error) {
            if (error.message !== 'timeout') {
                console.error("Error al guardar cliente:", error);
                toast("Hubo un error al guardar el cliente.", "error");
                return;
            }
        }

        if (existente && !existente.empty) {
            toast("Ya existe un cliente con ese nombre.", "warning");
            return;
        }

        let ref;
        try {
            ref = await conTimeout(addDoc(collection(db, "clientes"), {
                nombre: nombre,
                nombreNorm,
                telefono: telefono,
                fechaRegistro: new Date()
            }), 3000);
        } catch (error) {
            if (error.message !== 'timeout') {
                console.error("Error al guardar cliente:", error);
                toast("Hubo un error al guardar el cliente.", "error");
                return;
            }
            ref = { id: crypto.randomUUID() };
        }

        clientesCache.push({ id: ref.id, nombre, nombreNorm });
        clientesCache.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        guardarCache(CACHE_CLIENTES, clientesCache);

        toast("¡Cliente guardado con éxito!");
        clienteBusqueda.value = nombre;
        buscarClientes(nombre);
        cerrarModalHandler();
    });
});
async function guardarVenta(cliente, cantidad, estadoPago, fechaVenta) {
    const total = cantidad * PRECIO_FUNDA;
    try {
        await conTimeout(addDoc(collection(db, "ventas"), {
            cliente: cliente || "Cliente General",
            cantidadFundas: cantidad,
            totalVenta: total,
            estadoPago,
            fecha: fechaVenta
        }), 3000);
    } catch (error) {
        if (error.message !== 'timeout') {
            console.error("Error al registrar transacción: ", error);
            toast("Hubo un error al guardar la transacción.", "error");
            return;
        }
    }

    toast(estadoPago === 'debe'
        ? "¡Venta registrada como FIADA (Pendiente)!"
        : "¡Venta registrada con éxito!");

    const fechaSeleccionada = fechaVentaSelect.value;
    formVenta.reset();
    fechaVentaSelect.value = fechaSeleccionada;
    estadoPagoSelect.value = "pagado";
    cerrarSugerencias();
    totalPagarSpan.textContent = PRECIO_FUNDA.toFixed(2);
    clienteBusqueda.value = "";
    ocultarInfoSaldo();
    cargarVentasDelDia().catch(() => {});
}

formVenta.addEventListener('submit', (e) => {
    e.preventDefault();

    ejecutarConBotonBloqueado(e.submitter, async () => {
        const cliente = limpiarTexto(clienteBusqueda.value, 80);
        const estadoPago = estadoPagoSelect.value;
        const fechaVenta = new Date();
        fechaVenta.setDate(fechaVenta.getDate() + offsetDiasSeleccionado());

        const cantidad = validarEntero(cantidadInput.value, 1, 999);
        if (cantidad === null) {
            toast("Ingresa una cantidad válida de fundas (1 a 999).", "warning");
            return;
        }

        const clienteFinal = cliente || "Cliente General";

        let ventasHoy = 0;
        let totalHoy = 0;
        try {
            const resultado = await obtenerVentasDeHoyCliente(clienteFinal);
            ventasHoy = resultado.ventas;
            totalHoy = resultado.total;
        } catch (error) {
            // Sin caché local y offline: se omite la verificación de duplicados
            // para no bloquear el registro. El usuario puede guardar sin restricción.
            console.warn("No se pudo verificar duplicados (offline):", error);
        }

        if (ventasHoy > 0) {
            abrirModalVentaDuplicada(clienteFinal, totalHoy, () => {
                guardarVenta(clienteFinal, cantidad, estadoPago, fechaVenta);
            });
        } else {
            await guardarVenta(clienteFinal, cantidad, estadoPago, fechaVenta);
        }
    });
});

restaurarDiaConsultado();
cargarVentasDelDia();
