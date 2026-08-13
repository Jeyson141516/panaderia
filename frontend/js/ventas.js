import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, serverTimestamp, query, where, limit, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast, escapeHtml } from './ui.js';
import { normalizarTexto } from './utils.js';

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
const ventasDiaCache = [];
let saldosMap = {};
let saldosNormMap = {};

const ETIQUETAS_PERIODO = { "0": "Hoy", "-1": "Ayer", "-2": "Antes de ayer" };

function offsetDiasSeleccionado() {
    return parseInt(fechaVentaSelect.value, 10) || 0;
}

function fechaInicioPeriodo() {
    const d = new Date();
    d.setDate(d.getDate() + offsetDiasSeleccionado());
    d.setHours(0, 0, 0, 0);
    return d;
}

function fechaFinPeriodo() {
    const d = new Date();
    d.setDate(d.getDate() + offsetDiasSeleccionado());
    d.setHours(23, 59, 59, 999);
    return d;
}

function etiquetaPeriodo() {
    return ETIQUETAS_PERIODO[fechaVentaSelect.value] || "Hoy";
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
}

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
        const inicio = fechaInicioPeriodo();
        const fin = fechaFinPeriodo();

        ventasDiaTitulo.textContent = `Ventas del Día (${etiquetaPeriodo()})`;

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
            ventasDiaCache.push({
                cliente: v.cliente || "Cliente General",
                cantidad: Number(v.cantidadFundas) || 0,
                total: Number(v.totalVenta) || 0,
                estado: v.estadoPago || "pagado",
                hora: v.fecha && v.fecha.toDate ? formatearHora(v.fecha.toDate()) : "--:--"
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
    const total = Number.isFinite(cantidad) && cantidad > 0 ? cantidad * PRECIO_FUNDA : 0;
    totalPagarSpan.textContent = total.toFixed(2);
}

function actualizarTotalAbono() {
    const monto = parseFloat(montoAbonoInput.value);
    totalPagarSpan.textContent = (Number.isFinite(monto) && monto > 0 ? monto : 0).toFixed(2);
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

fechaVentaSelect.addEventListener('change', () => {
    ventasDiaTitulo.textContent = `Ventas del Día (${etiquetaPeriodo()})`;
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

function cargarClientes() {
    if (!clientesPromise) {
        clientesPromise = getDocs(collection(db, "clientes")).then((querySnapshot) => {
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

    await cargarClientes();
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

guardarClienteModal.addEventListener('click', async () => {
    const nombre = nuevoNombreInput.value.trim();
    const telefono = nuevoTelefonoInput.value.trim();

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

        toast("¡Cliente guardado con éxito!");
        clienteBusqueda.value = nombre;
        buscarClientes(nombre);
        cerrarModalHandler();
    } catch (error) {
        console.error("Error al guardar cliente:", error);
        toast("Hubo un error al guardar el cliente.", "error");
    }
});

formVenta.addEventListener('submit', async (e) => {
    e.preventDefault();

    const cliente = clienteBusqueda.value.trim();
    const estadoPago = estadoPagoSelect.value;
    const fechaVenta = new Date();
    fechaVenta.setDate(fechaVenta.getDate() + offsetDiasSeleccionado());

    try {
        if (estadoPago === 'abono') {
            if (!cliente) {
                toast("Selecciona el cliente que está abonando.", "warning");
                return;
            }
            const monto = parseFloat(montoAbonoInput.value);
            if (!Number.isFinite(monto) || monto <= 0) {
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
            const cantidad = parseInt(cantidadInput.value, 10);
            if (!Number.isFinite(cantidad) || cantidad <= 0) {
                toast("Ingresa una cantidad válida de fundas.", "warning");
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

cargarVentasDelDia();
