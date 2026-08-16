import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast, escapeHtml } from './ui.js';
import { normalizarTexto, limpiarTexto, validarMonto, ejecutarConBotonBloqueado, leerCache, guardarCache, esCoincidenciaFuzzy } from './utils.js';

const formGasto = document.getElementById('formGasto');
const tablaGastos = document.getElementById('tablaGastos');
const busquedaGasto = document.getElementById('busquedaGasto');
const fechaFiltroGasto = document.getElementById('fechaFiltroGasto');
const fechaDesdeGasto = document.getElementById('fechaDesdeGasto');
const fechaHastaGasto = document.getElementById('fechaHastaGasto');
const totalGastosEl = document.getElementById('totalGastos');
const botonesRapidosGasto = Array.from(document.querySelectorAll('.btn-rapido-dia'));

const productoBusqueda = document.getElementById('productoBusqueda');
const btnNuevoProducto = document.getElementById('btnNuevoProducto');
const listaSugerenciasProducto = document.getElementById('listaSugerenciasProducto');
const busquedaInventario = document.getElementById('busquedaInventario');
const tablaInventario = document.getElementById('tablaInventario');

const btnVerInventario = document.getElementById('btnVerInventario');
const modalInventario = document.getElementById('modalInventario');
const cerrarModalInventario = document.getElementById('cerrarModalInventario');

const modalProducto = document.getElementById('modalProducto');
const cerrarModalProducto = document.getElementById('cerrarModalProducto');
const guardarProductoModal = document.getElementById('guardarProductoModal');
const nuevoNombreProducto = document.getElementById('nuevoNombreProducto');

let inventarioCache = [];
let filtroInventario = "";
let productoSeleccionado = null;
let indiceActivo = -1;

let gastosCache = [];
let filtroGastoTexto = "";
let filtroGastoDia = "";
let filtroGastoDesde = "";
let filtroGastoHasta = "";

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

formGasto.addEventListener('submit', (e) => {
    e.preventDefault();

    ejecutarConBotonBloqueado(e.submitter, async () => {
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

        const monto = validarMonto(document.getElementById('monto').value, 0.01, 1000000);

        if (monto === null) {
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
});

function diaLocal(fecha) {
    if (!fecha) return "";
    const d = fecha.toDate ? fecha.toDate() : (fecha instanceof Date ? fecha : null);
    if (!d) return "";
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

async function cargarGastos() {
    try {
        const snapshot = await getDocs(query(collection(db, "gastos_inventario"), orderBy("fecha", "desc")));

        gastosCache = [];
        snapshot.forEach((docSnap) => gastosCache.push({ id: docSnap.id, ...docSnap.data() }));

        renderGastos();
    } catch (error) {
        console.error("Error cargando gastos:", error);
        totalGastosEl.textContent = formatearMoneda(0);
        tablaGastos.innerHTML = '<tr><td colspan="3" class="empty-cell">No se pudo cargar el historial de gastos.</td></tr>';
    }
}

function renderGastos() {
    const diaFiltro = filtroGastoDia;

    const filtrados = gastosCache.filter((g) => {
        const coincideTexto = esCoincidenciaFuzzy(g.producto || g.descripcion || "", filtroGastoTexto);
        const coincideDia = !diaFiltro || diaLocal(g.fecha) === diaFiltro;
        const dia = diaLocal(g.fecha);
        const coincideRango = (!filtroGastoDesde || dia >= filtroGastoDesde) && (!filtroGastoHasta || dia <= filtroGastoHasta);
        return coincideTexto && coincideDia && coincideRango;
    });

    if (gastosCache.length === 0) {
        totalGastosEl.textContent = formatearMoneda(0);
        tablaGastos.innerHTML = '<tr><td colspan="3" class="empty-cell">Aún no hay gastos registrados.</td></tr>';
        return;
    }

    if (filtrados.length === 0) {
        totalGastosEl.textContent = formatearMoneda(0);
        tablaGastos.innerHTML = '<tr><td colspan="3" class="empty-cell">No hay gastos que coincidan con los filtros.</td></tr>';
        return;
    }

    const total = filtrados.reduce((suma, g) => suma + (Number(g.monto) || 0), 0);
    totalGastosEl.textContent = formatearMoneda(total);

    tablaGastos.innerHTML = filtrados.map((g) => `
        <tr>
            <td>${formatearFecha(g.fecha)}</td>
            <td>${escapeHtml(g.producto || g.descripcion || "—")}</td>
            <td class="monto-cell">${formatearMoneda(g.monto)}</td>
        </tr>`).join("");
}

/* ============ Inventario de productos ============ */

const CACHE_INVENTARIO = 'inventario';
const TTL_INVENTARIO_MS = 30 * 60 * 1000;

function cargarInventario() {
    // Renderiza la lista guardada al instante mientras se refresca en segundo plano.
    const cacheado = leerCache(CACHE_INVENTARIO, TTL_INVENTARIO_MS);
    if (cacheado) {
        inventarioCache = cacheado;
        renderInventario();
    }

    return getDocs(query(collection(db, "inventario"), orderBy("nombreNorm", "asc")))
        .then((snapshot) => {
            inventarioCache = [];
            snapshot.forEach((docSnap) => {
                inventarioCache.push({ id: docSnap.id, ...docSnap.data() });
            });
            guardarCache(CACHE_INVENTARIO, inventarioCache);
            renderInventario();
        })
        .catch((error) => {
            console.error("Error cargando inventario:", error);
            if (inventarioCache.length === 0) {
                tablaInventario.innerHTML = '<tr><td colspan="2" class="empty-cell">No se pudo cargar el inventario.</td></tr>';
            }
            toast("Hubo un error al cargar el inventario.", "error");
        });
}

function renderInventario() {
    const filtrados = inventarioCache.filter((p) => esCoincidenciaFuzzy(p.nombre, filtroInventario));

    if (filtrados.length === 0) {
        tablaInventario.innerHTML = `<tr><td colspan="2" class="empty-cell">${filtroInventario.trim() ? "No hay productos que coincidan." : "Aún no hay productos en el inventario. Agrégales con el buscador de arriba."}</td></tr>`;
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
        guardarCache(CACHE_INVENTARIO, inventarioCache);
        renderInventario();
        toast("Producto eliminado del inventario.");
    } catch (error) {
        console.error("Error al eliminar producto:", error);
        toast("Hubo un error al eliminar el producto.", "error");
    }
}

btnVerInventario.addEventListener('click', () => {
    busquedaInventario.value = "";
    filtroInventario = "";
    cargarInventario();
    modalInventario.style.display = 'flex';
    setTimeout(() => busquedaInventario.focus(), 50);
});

cerrarModalInventario.addEventListener('click', cerrarModalInventarioHandler);
modalInventario.addEventListener('click', (e) => {
    if (e.target === modalInventario) cerrarModalInventarioHandler();
});

function cerrarModalInventarioHandler() {
    modalInventario.style.display = 'none';
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cerrarModalInventarioHandler();
        cerrarModalProductoHandler();
    }
});

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

guardarProductoModal.addEventListener('click', () => {
    ejecutarConBotonBloqueado(guardarProductoModal, async () => {
        const nombre = limpiarTexto(nuevoNombreProducto.value, 80);

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
            guardarCache(CACHE_INVENTARIO, inventarioCache);
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
    const matches = inventarioCache
        .filter((p) => esCoincidenciaFuzzy(p.nombre, texto))
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

busquedaGasto.addEventListener('input', (e) => {
    filtroGastoTexto = e.target.value;
    renderGastos();
});

function fechaOffsetLocal(dias) {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function limpiarFiltroDia() {
    filtroGastoDia = "";
    fechaFiltroGasto.value = "";
    botonesRapidosGasto.forEach((b) => b.classList.remove('activo'));
}

function limpiarFiltroRango() {
    filtroGastoDesde = "";
    filtroGastoHasta = "";
    fechaDesdeGasto.value = "";
    fechaHastaGasto.value = "";
}

fechaFiltroGasto.addEventListener('change', (e) => {
    filtroGastoDia = e.target.value;
    botonesRapidosGasto.forEach((b) => b.classList.remove('activo'));
    limpiarFiltroRango();
    renderGastos();
});

botonesRapidosGasto.forEach((btn) => {
    btn.addEventListener('click', () => {
        const dias = parseInt(btn.dataset.dias, 10) || 0;
        fechaFiltroGasto.value = fechaOffsetLocal(dias);
        filtroGastoDia = fechaFiltroGasto.value;
        botonesRapidosGasto.forEach((b) => b.classList.toggle('activo', b === btn));
        limpiarFiltroRango();
        renderGastos();
    });
});

fechaDesdeGasto.addEventListener('change', (e) => {
    filtroGastoDesde = e.target.value;
    limpiarFiltroDia();
    renderGastos();
});

fechaHastaGasto.addEventListener('change', (e) => {
    filtroGastoHasta = e.target.value;
    limpiarFiltroDia();
    renderGastos();
});

cargarInventario();
cargarGastos();
