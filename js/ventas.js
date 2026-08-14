import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, serverTimestamp, query, where, limit, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast, escapeHtml } from './ui.js';
import { normalizarTexto, limpiarTexto, validarEntero, validarMonto, validarTelefono, ejecutarConBotonBloqueado, leerCache, guardarCache } from './utils.js';

const PRECIO_FUNDA = 1.00;

const cantidadInput = document.getElementById('cantidad');
const totalPagarSpan = document.getElementById('totalPagar');
const totalLabel = document.getElementById('totalLabel');
const formVenta = document.getElementById('formVenta');
const clienteBusqueda = document.getElementById('clienteBusqueda');
const listaSugerencias = document.getElementById('listaSugerencias');
const saldoInfo = document.getElementById('clienteSaldoInfo');
const saldoInfoText = document.getElementById('clienteSaldoText');
const btnAbonoSaldo = document.getElementById('btnAbonoSaldo');
const estadoPagoSelect = document.getElementById('estadoPago');
const fechaVentaSelect = document.getElementById('fechaVenta');
const ventasDiaTitulo = document.getElementById('ventasDiaTitulo');
const grupoCantidad = document.getElementById('grupoCantidad');
const grupoAbono = document.getElementById('grupoAbono');
const montoAbonoInput = document.getElementById('montoAbono');

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
            const coincide = termino === '' || normalizarTexto(tr.textContent).includes(termino);
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
 * Suma SOLO las ventas de contado (estado 'pagado'); excluye por completo
 * fiados ('debe') y abonos ('abono'). Respeta el buscador activo: si el
 * usuario filtra, el total refleja las ventas pagadas visibles.
 */
function actualizarContadorDia() {
    const termino = normalizarTexto(buscadorVentasDia.value);
    let total = 0;

    ventasDiaCache.forEach((v) => {
        if (v.estado !== 'pagado') return;
        if (termino && !normalizarTexto(v.cliente).includes(termino)) return;
        total += v.total;
    });

    if (totalDiaContado) {
        totalDiaContado.textContent = formatearMoneda(total);
    }
}

buscadorVentasDia.addEventListener('input', aplicarFiltroBuscadorVentas);

async function cargarSaldos() {
    const snapshot = await getDocs(
        query(collection(db, "ventas"),
            where("estadoPago", "in", ["debe", "abono"]))
    );

    saldosMap = {};
    saldosNormMap = {};
    snapshot.forEach((docSnap) => {
        const v = docSnap.data();
        const nombre = v.cliente || "Cliente General";
        const monto = Number(v.totalVenta) || 0;
        let saldo = saldosMap[nombre] || 0;
        if (v.estadoPago === 'debe') {
            saldo += monto;
        } else if (v.estadoPago === 'abono') {
            saldo -= monto;
        }
        saldosMap[nombre] = saldo;
        saldosNormMap[normalizarTexto(nombre)] = { nombre, saldo };
    });
}

async function cargarVentasDelDia() {
    try {
        const { anio, mes, diaNum, inicio, fin } = rangoDiaConsultado();
        ventasDiaTitulo.textContent = `Ventas del Día (${formatearFechaLocal(inicio)})`;

        const [querySnapshot] = await Promise.all([
            getDocs(
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

function actualizarTotalAbono() {
    const monto = validarMonto(montoAbonoInput.value);
    totalPagarSpan.textContent = (monto !== null ? monto : 0).toFixed(2);
}

function actualizarFormularioAbono() {
    const esAbono = estadoPagoSelect.value === 'abono';
    grupoCantidad.classList.toggle('hidden', esAbono);
    grupoAbono.classList.toggle('hidden', !esAbono);
    cantidadInput.required = !esAbono;
    totalLabel.textContent = esAbono ? 'Monto a Abonar' : 'Total a Pagar';
    if (esAbono) {
        actualizarTotalAbono();
    } else {
        actualizarTotalVenta();
    }
}

cantidadInput.addEventListener('input', actualizarTotalVenta);

montoAbonoInput.addEventListener('input', actualizarTotalAbono);

estadoPagoSelect.addEventListener('change', actualizarFormularioAbono);

const CLAVE_DIA_CONSULTA = 'panaderia-dia-consulta';

function restaurarDiaConsultado() {
    const guardado = localStorage.getItem(CLAVE_DIA_CONSULTA);
    const valido = guardado && /^\d{4}-\d{2}-\d{2}$/.test(guardado);
    fechaFiltroDia.value = valido ? guardado : fechaHoyLocal();
}

fechaFiltroDia.addEventListener('change', () => {
    // Solo se toca el valor cuando el campo quedó vacío (fallback a hoy).
    // Una fecha elegida por el usuario se conserva tal cual y se persiste.
    if (!fechaFiltroDia.value) {
        fechaFiltroDia.value = fechaHoyLocal();
    }
    localStorage.setItem(CLAVE_DIA_CONSULTA, fechaFiltroDia.value);
    cargarVentasDelDia();
});

function prepararAbono(cliente) {
    clienteBusqueda.value = cliente;
    actualizarInfoSaldo(cliente);
    estadoPagoSelect.value = 'abono';
    actualizarFormularioAbono();
    montoAbonoInput.value = (saldosMap[cliente] > 0 ? saldosMap[cliente] : 0).toFixed(2);
    actualizarTotalAbono();
    cerrarSugerencias();
    formVenta.scrollIntoView({ behavior: 'smooth', block: 'start' });
    montoAbonoInput.focus();
}

tablaVentasDebe.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-abonar');
    if (!btn) return;
    prepararAbono(btn.dataset.cliente);
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

        clientesPromise = getDocs(collection(db, "clientes"))
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
    const termino = normalizarTexto(texto);

    listaSugerencias.innerHTML = '';
    indiceActivo = -1;
    let matches = 0;

    clientesCache.forEach((cliente) => {
        if (cliente.nombreNorm.includes(termino)) {
            matches++;
            const li = document.createElement('li');
            li.textContent = cliente.nombre;
            li.addEventListener('click', () => seleccionarCliente(cliente.nombre));
            li.addEventListener('mouseenter', () => {
                indiceActivo = matches - 1;
                actualizarResaltado();
            });
            listaSugerencias.appendChild(li);
        }
    });

    if (matches === 0) {
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
        seleccionarCliente(items[Math.max(indiceActivo, 0)].textContent);
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

guardarClienteModal.addEventListener('click', () => {
    ejecutarConBotonBloqueado(guardarClienteModal, async () => {
        const nombre = limpiarTexto(nuevoNombreInput.value, 80);
        const telefono = validarTelefono(nuevoTelefonoInput.value);

        if (!nombre) {
            toast("Por favor escribe el nombre del cliente.", "warning");
            return;
        }

        const nombreNorm = normalizarTexto(nombre);

        try {
            const existente = await getDocs(query(collection(db, "clientes"), where("nombreNorm", "==", nombreNorm), limit(1)));

            if (!existente.empty) {
                toast("Ya existe un cliente con ese nombre.", "warning");
                return;
            }

            const ref = await addDoc(collection(db, "clientes"), {
                nombre: nombre,
                nombreNorm,
                telefono: telefono,
                fechaRegistro: serverTimestamp()
            });

            clientesCache.push({ id: ref.id, nombre, nombreNorm });
            clientesCache.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
            guardarCache(CACHE_CLIENTES, clientesCache);

            toast("¡Cliente guardado con éxito!");
            clienteBusqueda.value = nombre;
            buscarClientes(nombre);
            cerrarModalHandler();
        } catch (error) {
            console.error("Error al guardar cliente:", error);
            toast("Hubo un error al guardar el cliente.", "error");
        }
    });
});
formVenta.addEventListener('submit', (e) => {
    e.preventDefault();

    ejecutarConBotonBloqueado(e.submitter, async () => {
        const cliente = limpiarTexto(clienteBusqueda.value, 80);
        const estadoPago = estadoPagoSelect.value;
        const fechaVenta = new Date();
        fechaVenta.setDate(fechaVenta.getDate() + offsetDiasSeleccionado());

        try {
            if (estadoPago === 'abono') {
                if (!cliente) {
                    toast("Selecciona el cliente que está abonando.", "warning");
                    return;
                }

                const monto = validarMonto(montoAbonoInput.value, 0.01, 1000000);
                if (monto === null) {
                    toast("Ingresa un monto de abono válido.", "warning");
                    return;
                }

                await addDoc(collection(db, "ventas"), {
                    cliente,
                    cantidadFundas: 0,
                    totalVenta: monto,
                    estadoPago: 'abono',
                    montoAbono: monto,
                    fecha: fechaVenta
                });

                toast("¡Abono registrado! Deuda actualizada.");
            } else {
                const cantidad = validarEntero(cantidadInput.value, 1, 999);
                if (cantidad === null) {
                    toast("Ingresa una cantidad válida de fundas (1 a 999).", "warning");
                    return;
                }

                const total = cantidad * PRECIO_FUNDA;
                await addDoc(collection(db, "ventas"), {
                    cliente: cliente || "Cliente General",
                    cantidadFundas: cantidad,
                    totalVenta: total,
                    estadoPago,
                    fecha: fechaVenta
                });

                toast(estadoPago === 'debe'
                    ? "¡Venta registrada como FIADA (Pendiente)!"
                    : "¡Venta registrada con éxito!");
            }

            const fechaSeleccionada = fechaVentaSelect.value;
            formVenta.reset();
            fechaVentaSelect.value = fechaSeleccionada;
            estadoPagoSelect.value = "pagado";
            actualizarFormularioAbono();
            cerrarSugerencias();
            totalPagarSpan.textContent = PRECIO_FUNDA.toFixed(2);
            clienteBusqueda.value = "";
            ocultarInfoSaldo();
            await cargarVentasDelDia();
        } catch (error) {
            console.error("Error al registrar transacción: ", error);
            toast("Hubo un error al guardar la transacción.", "error");
        }
    });
});

restaurarDiaConsultado();
cargarVentasDelDia();
