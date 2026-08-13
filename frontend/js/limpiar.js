import { db } from './firebase-config.js';
import { collection, getDocs, deleteDoc, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast } from './ui.js';

const btnLimpiar = document.getElementById('btnLimpiar');
const estadoLimpieza = document.getElementById('estadoLimpieza');

const ADMIN_PIN = "1234";
const LOTE_MAX = 400;

function establecerEstado(texto, color) {
    estadoLimpieza.textContent = texto;
    estadoLimpieza.style.color = color;
}

async function borrarColeccionEnLotes(nombreColeccion) {
    const querySnapshot = await getDocs(collection(db, nombreColeccion));
    const ids = querySnapshot.docs.map((d) => d.id);

    for (let i = 0; i < ids.length; i += LOTE_MAX) {
        const loteIds = ids.slice(i, i + LOTE_MAX);
        const lote = writeBatch(db);
        loteIds.forEach((id) => lote.delete(doc(db, nombreColeccion, id)));
        await lote.commit();
    }

    return ids.length;
}

btnLimpiar.addEventListener('click', async () => {
    const pin = prompt("Ingresa el código de administrador para continuar:");
    if (pin === null) return;
    if (pin.trim() !== ADMIN_PIN) {
        toast("Código incorrecto. Operación cancelada.", "error");
        return;
    }

    const confirmar = confirm("¿Estás 100% seguro de que deseas borrar TODA la base de datos? Esta acción no se puede deshacer.");
    if (!confirmar) return;

    btnLimpiar.disabled = true;
    establecerEstado("Eliminando datos, por favor espera...", "#d35400");

    try {
        const colecciones = ["ventas", "clientes", "inventario", "gastos_inventario", "adelantos", "pagos_personal"];
        let totalEliminados = 0;

        for (const nombreColeccion of colecciones) {
            totalEliminados += await borrarColeccionEnLotes(nombreColeccion);
        }

        establecerEstado(`¡Base de datos limpiada con éxito! Se eliminaron ${totalEliminados} registros.`, "#22c55e");
        toast("¡Base de datos limpiada con éxito!", "success");
    } catch (error) {
        console.error("Error al limpiar la base de datos:", error);
        establecerEstado("Hubo un error al intentar limpiar la base de datos.", "#c0392b");
        toast("Hubo un error al intentar limpiar la base de datos.", "error");
    } finally {
        btnLimpiar.disabled = false;
    }
});
