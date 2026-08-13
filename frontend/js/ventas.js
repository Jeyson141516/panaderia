import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, serverTimestamp, query, where, limit, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast, escapeHtml } from './ui.js';
import { normalizarTexto } from './utils.js';

const PRECIO_FUNDA = 1.00;

const cantidadInput = document.getElementById('cantidad');
const totalPagarSpan = document.getElementById('totalPagar');
const formVenta = document.getElementById('formVenta');
const clienteBusqueda = document.getElementById('clienteBusqueda');
const listaSugerencias = document.getElementById('listaSugerencias');
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
const ventasDiaCache = [];

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
        <tr>
            <td>${escapeHtml(v.cliente)}</td>
            <td>${v.cantidad}</td>
            <td class="monto-cell">${formatearMoneda(v.total)}</td>
            <td>${v.hora}</td>
        </tr>`).join("");
}

function renderVentasDia() {
    const pagadas = ventasDiaCache.filter((v) => v.estado !== 'debe');
    const pendientes = ventasDiaCache.filter((v) => v.estado === 'debe');

    renderTablaVentas(tablaVentasPagado, pagadas, 'Aún no hay ventas pagadas en el período seleccionado.');
    renderTablaVentas(tablaVentasDebe, pendientes, 'No hay deudas pendientes. Todo al día.');
}

async function cargarVentasDelDia() {
    try {
        const inicio = fechaInicioPeriodo();
        const fin = fechaFinPeriodo();

        ventasDiaTitulo.textContent = `Ventas del Día (${etiquetaPeriodo()})`;

        const querySnapshot = await getDocs(
            query(collection(db, "ventas"),
                where("fecha", ">=", inicio),
                where("fecha", "<=", fin),
                orderBy("fecha", "desc"))
        );

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

cantidadInput.addEventListener('input', (e) => {
    const cantidad = parseInt(e.target.value, 10);
    const total = Number.isFinite(cantidad) && cantidad > 0 ? cantidad * PRECIO_FUNDA : 0;
    totalPagarSpan.textContent = total.toFixed(2);
});

fechaVentaSelect.addEventListener('change', () => {
    ventasDiaTitulo.textContent = `Ventas del Día (${etiquetaPeriodo()})`;
    cargarVentasDelDia();
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

function seleccionarCliente(nombre) {
    clienteBusqueda.value = nombre;
    cerrarSugerencias();
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
        return;
    }

    await cargarClientes();
    buscarClientes(texto);
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

    const cliente = clienteBusqueda.value.trim() || "Cliente General";
    const cantidad = parseInt(cantidadInput.value, 10);

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
        toast("Ingresa una cantidad válida de fundas.", "warning");
        return;
    }

    const total = cantidad * PRECIO_FUNDA;
    const estadoPago = estadoPagoSelect.value;
    const fechaVenta = new Date();
    fechaVenta.setDate(fechaVenta.getDate() + offsetDiasSeleccionado());

    try {
        await addDoc(collection(db, "ventas"), {
            cliente: cliente,
            cantidadFundas: cantidad,
            totalVenta: total,
            estadoPago: estadoPago,
            fecha: fechaVenta
        });

        toast(estadoPago === 'debe'
            ? "¡Venta registrada como FIADA (Pendiente)!"
            : "¡Venta registrada con éxito!");

        ventasDiaCache.unshift({
            cliente,
            cantidad,
            total,
            estado: estadoPago,
            hora: formatearHora(fechaVenta)
        });
        renderVentasDia();

        const fechaSeleccionada = fechaVentaSelect.value;
        formVenta.reset();
        fechaVentaSelect.value = fechaSeleccionada;
        cerrarSugerencias();
        totalPagarSpan.textContent = PRECIO_FUNDA.toFixed(2);
        clienteBusqueda.value = "";
        estadoPagoSelect.value = "pagado";
    } catch (error) {
        console.error("Error al registrar venta: ", error);
        toast("Hubo un error al guardar la venta.", "error");
    }
});

cargarVentasDelDia();
