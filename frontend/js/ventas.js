import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, serverTimestamp, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast } from './ui.js';

const PRECIO_FUNDA = 1.00;

const cantidadInput = document.getElementById('cantidad');
const totalPagarSpan = document.getElementById('totalPagar');
const formVenta = document.getElementById('formVenta');
const clienteBusqueda = document.getElementById('clienteBusqueda');
const listaSugerencias = document.getElementById('listaSugerencias');
const estadoPagoSelect = document.getElementById('estadoPago');

const btnAbrirModal = document.getElementById('btnAbrirModal');
const modalCliente = document.getElementById('modalCliente');
const cerrarModal = document.getElementById('cerrarModal');
const guardarClienteModal = document.getElementById('guardarClienteModal');
const nuevoNombreInput = document.getElementById('nuevoNombre');
const nuevoTelefonoInput = document.getElementById('nuevoTelefono');

cantidadInput.addEventListener('input', (e) => {
    const cantidad = parseInt(e.target.value, 10);
    const total = Number.isFinite(cantidad) && cantidad > 0 ? cantidad * PRECIO_FUNDA : 0;
    totalPagarSpan.textContent = total.toFixed(2);
});

let busquedaSeq = 0;
let debounceTimer = null;

clienteBusqueda.addEventListener('input', (e) => {
    const texto = e.target.value.trim();
    clearTimeout(debounceTimer);

    if (texto.length === 0) {
        listaSugerencias.style.display = 'none';
        return;
    }

    debounceTimer = setTimeout(() => buscarClientes(texto), 220);
});

async function buscarClientes(texto) {
    const secuencia = ++busquedaSeq;
    const termino = texto.toLowerCase();

    try {
        const querySnapshot = await getDocs(
            query(collection(db, "clientes"), orderBy("nombre"), limit(20))
        );

        if (secuencia !== busquedaSeq) return;

        listaSugerencias.innerHTML = '';
        let matches = 0;

        querySnapshot.forEach((docSnap) => {
            const cliente = docSnap.data();
            const nombre = cliente.nombre || '';
            if (nombre.toLowerCase().includes(termino)) {
                matches++;
                const li = document.createElement('li');
                li.textContent = nombre;
                li.addEventListener('click', () => {
                    clienteBusqueda.value = nombre;
                    listaSugerencias.style.display = 'none';
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
    } catch (error) {
        console.error("Error buscando clientes:", error);
    }
}

document.addEventListener('click', (e) => {
    if (!clienteBusqueda.contains(e.target) && !listaSugerencias.contains(e.target)) {
        listaSugerencias.style.display = 'none';
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

    try {
        await addDoc(collection(db, "clientes"), {
            nombre: nombre,
            telefono: telefono,
            fechaRegistro: serverTimestamp()
        });

        toast("¡Cliente guardado con éxito!");
        clienteBusqueda.value = nombre;
        listaSugerencias.style.display = 'none';
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

    try {
        await addDoc(collection(db, "ventas"), {
            cliente: cliente,
            cantidadFundas: cantidad,
            totalVenta: total,
            estadoPago: estadoPago,
            fecha: serverTimestamp()
        });

        toast(estadoPago === 'debe'
            ? "¡Venta registrada como FIADA (Pendiente)!"
            : "¡Venta registrada con éxito!");

        formVenta.reset();
        totalPagarSpan.textContent = PRECIO_FUNDA.toFixed(2);
        clienteBusqueda.value = "";
        estadoPagoSelect.value = "pagado";
    } catch (error) {
        console.error("Error al registrar venta: ", error);
        toast("Hubo un error al guardar la venta.", "error");
    }
});
