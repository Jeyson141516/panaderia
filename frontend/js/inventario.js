import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast } from './ui.js';

const formGasto = document.getElementById('formGasto');

formGasto.addEventListener('submit', async (e) => {
    e.preventDefault();

    const descripcion = document.getElementById('descripcion').value.trim();
    const monto = parseFloat(document.getElementById('monto').value);

    if (!descripcion) {
        toast("Escribe la descripción del gasto.", "warning");
        return;
    }
    if (!Number.isFinite(monto) || monto <= 0) {
        toast("Ingresa un monto válido mayor a 0.", "warning");
        return;
    }

    try {
        await addDoc(collection(db, "gastos_inventario"), {
            descripcion,
            monto,
            fecha: serverTimestamp()
        });
        toast("¡Gasto de inventario registrado correctamente!");
        formGasto.reset();
    } catch (error) {
        console.error("Error al guardar gasto: ", error);
        toast("Hubo un error al registrar el gasto.", "error");
    }
});
