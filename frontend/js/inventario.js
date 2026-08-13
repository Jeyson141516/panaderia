import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast, escapeHtml } from './ui.js';
import { normalizarTexto } from './utils.js';

const formGasto = document.getElementById('formGasto');
const tablaGastos = document.getElementById('tablaGastos');

const productoBusqueda = document.getElementById('productoBusqueda');
const btnNuevoProducto = document.getElementById('btnNuevoProducto');
const listaSugerenciasProducto = document.getElementById('listaSugerenciasProducto');
const busquedaInventario = document.getElementById('busquedaInventario');
const tablaInventario = document.getElementById('tablaInventario');

const modalProducto = document.getElementById('modalProducto');
const cerrarModalProducto = document.getElementById('cerrarModalProducto');
const guardarProductoModal = document.getElementById('guardarProductoModal');
const nuevoNombreProducto = document.getElementById('nuevoNombreProducto');

let inventarioCache = [];
let filtroInventario = "";
let productoSeleccionado = null;
let indiceActivo = -1;

function formatearMoneda(valor) {
    return `$${Number(valor).toFixed(2)}`;
}

function formatearFecha(fecha) {
    if (!fecha) return "—";
    if (fecha.toDate) return fecha.toDate().toLocaleDateString("es-EC");
    if (fecha instanceof Date) return fecha.toLocaleDateString("es-EC");
    return String(fecha);
}

/* ============ Gastos de producción ============ */

formGasto.addEventListener('submit', async (e) => {
    e.preventDefault();

    let producto = productoSeleccionado;

    if (!producto) {
        const texto = productoBusqueda.value.trim();
        if (texto) {
            const norm = normalizarTexto(texto);
            producto = inventarioCache.find((p) => p.nombreNorm === norm) || null;
        }
    }

    if (!producto) {
        toast("Selecciona un producto de la lista o créalo con '+ Nuevo'.", "warning");
        return;
    }

    const monto = parseFloat(document.getElementById('monto').value);

    if (!Number.isFinite(monto) || monto <= 0) {
        toast("Ingresa un monto válido mayor a 0.", "warning");
        return;
    }

    try {
        await addDoc(collection(db, "gastos_inventario"), {
            producto: producto.nombre,
            productoNorm: producto.nombreNorm,
            monto,
            fecha: serverTimestamp()
        });

        toast(`¡Gasto de ${monto.toFixed(2)} en ${producto.nombre} registrado!`);
        formGasto.reset();
        productoSeleccionado = null;
        productoBusqueda.value = "";
        cargarGastos();
    } catch (error) {
        console.error("Error al guardar gasto: ", error);
        toast("Hubo un error al registrar el gasto.", "error");
    }
});

async function cargarGastos() {
    try {
        const snapshot = await getDocs(query(collection(db, "gastos_inventario"), orderBy("fecha", "desc"), limit(30)));

        const gastos = [];
        snapshot.forEach((docSnap) => gastos.push(docSnap.data()));

        if (gastos.length === 0) {
            tablaGastos.innerHTML = '<tr><td colspan="3" class="empty-cell">Aún no hay gastos registrados.</td></tr>';
            return;
        }

        tablaGastos.innerHTML = gastos.map((g) => `
            <tr>
                <td>${formatearFecha(g.fecha)}</td>
                <td>${escapeHtml(g.producto || g.descripcion || "—")}</td>
                <td class="monto-cell">${formatearMoneda(g.monto)}</td>
            </tr>`).join("");
    } catch (error) {
        console.error("Error cargando gastos:", error);
        tablaGastos.innerHTML = '<tr><td colspan="3" class="empty-cell">No se pudo cargar el historial de gastos.</td></tr>';
    }
}

/* ============ Inventario de productos ============ */

async function cargarInventario() {
    try {
        const snapshot = await getDocs(query(collection(db, "inventario"), orderBy("nombreNorm", "asc")));

        inventarioCache = [];
        snapshot.forEach((docSnap) => {
            inventarioCache.push({ id: docSnap.id, ...docSnap.data() });
        });

        renderInventario();
    } catch (error) {
        console.error("Error cargando inventario:", error);
        tablaInventario.innerHTML = '<tr><td colspan="2" class="empty-cell">No se pudo cargar el inventario.</td></tr>';
        toast("Hubo un error al cargar el inventario.", "error");
    }
}

function renderInventario() {
    const termino = normalizarTexto(filtroInventario);
    const filtrados = inventarioCache.filter((p) => {
        if (!termino) return true;
        return normalizarTexto(p.nombre).includes(termino);
    });

    if (filtrados.length === 0) {
        tablaInventario.innerHTML = `<tr><td colspan="2" class="empty-cell">${termino ? "No hay productos que coincidan." : "Aún no hay productos en el inventario. Agrégales con el buscador de arriba."}</td></tr>`;
        return;
    }

    tablaInventario.innerHTML = filtrados.map((p) => `
        <tr>
            <td>${escapeHtml(p.nombre)}</td>
            <td class="actions-cell">
                <button class="btn-icon" data-id="${p.id}" title="Eliminar del inventario">🗑️</button>
            </td>
        </tr>`).join("");

    tablaInventario.querySelectorAll('.btn-icon').forEach((btn) => {
        btn.addEventListener('click', () => eliminarProducto(btn.dataset.id));
    });
}

async function eliminarProducto(id) {
    if (!confirm("¿Eliminar este producto del inventario?")) return;

    try {
        await deleteDoc(doc(db, "inventario", id));
        inventarioCache = inventarioCache.filter((p) => p.id !== id);
        renderInventario();
        toast("Producto eliminado del inventario.");
    } catch (error) {
        console.error("Error al eliminar producto:", error);
        toast("Hubo un error al eliminar el producto.", "error");
    }
}

btnNuevoProducto.addEventListener('click', () => {
    modalProducto.style.display = 'flex';
    nuevoNombreProducto.value = '';
    nuevoNombreProducto.focus();
});

cerrarModalProducto.addEventListener('click', cerrarModalProductoHandler);
modalProducto.addEventListener('click', (e) => {
    if (e.target === modalProducto) cerrarModalProductoHandler();
});

function cerrarModalProductoHandler() {
    modalProducto.style.display = 'none';
}

guardarProductoModal.addEventListener('click', async () => {
    const nombre = nuevoNombreProducto.value.trim();

    if (!nombre) {
        toast("Escribe el nombre del producto.", "warning");
        return;
    }

    const nombreNorm = normalizarTexto(nombre);
    const duplicado = inventarioCache.find((p) => p.nombreNorm === nombreNorm);

    if (duplicado) {
        productoBusqueda.value = duplicado.nombre;
        cerrarModalProductoHandler();
        toast(`Ya existe "${duplicado.nombre}" en el inventario.`, "warning");
        return;
    }

    try {
        const ref = await addDoc(collection(db, "inventario"), {
            nombre,
            nombreNorm,
            fechaRegistro: serverTimestamp()
        });

        inventarioCache.push({ id: ref.id, nombre, nombreNorm });
        renderInventario();
        cerrarModalProductoHandler();

        productoSeleccionado = { id: ref.id, nombre, nombreNorm };
        productoBusqueda.value = nombre;
        toast(`¡${nombre} agregado al inventario! Ahora registra su gasto.`);
        document.getElementById('monto').focus();
    } catch (error) {
        console.error("Error al guardar producto: ", error);
        toast("Hubo un error al guardar el producto.", "error");
    }
});

/* ============ Autocompletado de productos ============ */

function cerrarSugerenciasProducto() {
    listaSugerenciasProducto.style.display = 'none';
    indiceActivo = -1;
}

function actualizarResaltado() {
    listaSugerenciasProducto.querySelectorAll('li').forEach((li, i) => {
        li.classList.toggle('active', i === indiceActivo && !li.classList.contains('no-result'));
    });
}

function seleccionarProducto(producto) {
    productoSeleccionado = producto;
    productoBusqueda.value = producto.nombre;
    cerrarSugerenciasProducto();
    document.getElementById('monto').focus();
}

productoBusqueda.addEventListener('input', (e) => {
    const texto = e.target.value.trim();
    indiceActivo = -1;
    productoSeleccionado = null;

    if (texto.length === 0) {
        cerrarSugerenciasProducto();
        return;
    }

    mostrarSugerencias(texto);
});

function mostrarSugerencias(texto) {
    const termino = normalizarTexto(texto);

    const matches = inventarioCache
        .filter((p) => normalizarTexto(p.nombre).includes(termino))
        .sort((a, b) => normalizarTexto(a.nombre).localeCompare(normalizarTexto(b.nombre)))
        .slice(0, 8);

    listaSugerenciasProducto.innerHTML = '';

    if (matches.length === 0) {
        const li = document.createElement('li');
        li.className = 'no-result';
        li.textContent = 'No se encontró el producto. Usa "+ Nuevo"';
        listaSugerenciasProducto.appendChild(li);
    } else {
        matches.forEach((p, i) => {
            const li = document.createElement('li');
            li.textContent = p.nombre;
            li.dataset.id = p.id;
            li.addEventListener('click', () => seleccionarProducto(p));
            li.addEventListener('mouseenter', () => {
                indiceActivo = i;
                actualizarResaltado();
            });
            listaSugerenciasProducto.appendChild(li);
        });
    }

    listaSugerenciasProducto.style.display = 'block';
}

productoBusqueda.addEventListener('keydown', (e) => {
    if (listaSugerenciasProducto.style.display === 'none') return;

    const items = [...listaSugerenciasProducto.querySelectorAll('li')].filter((li) => !li.classList.contains('no-result'));
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
        const producto = inventarioCache.find((p) => p.id === items[Math.max(indiceActivo, 0)].dataset.id);
        if (producto) seleccionarProducto(producto);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        cerrarSugerenciasProducto();
    }
});

document.addEventListener('click', (e) => {
    if (!productoBusqueda.contains(e.target) && !listaSugerenciasProducto.contains(e.target)) {
        cerrarSugerenciasProducto();
    }
});

busquedaInventario.addEventListener('input', (e) => {
    filtroInventario = e.target.value;
    renderInventario();
});

cargarInventario();
cargarGastos();
