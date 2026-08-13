import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toast } from './ui.js';

const formAdelanto = document.getElementById('formAdelanto');

formAdelanto.addEventListener('submit', async (e) => {
    e.preventDefault();

    const trabajador = document.getElementById('trabajador').value;
    const monto = parseFloat(document.getElementById('montoAdelanto').value);

    if (!Number.isFinite(monto) || monto <= 0) {
        toast("Ingresa un monto de adelanto válido mayor a 0.", "warning");
        return;
    }

    try {
        await addDoc(collection(db, "adelantos"), {
            trabajador,
            monto,
            fecha: serverTimestamp()
        });
        toast(`¡Adelanto de $${monto.toFixed(2)} registrado para ${trabajador}!`);
        formAdelanto.reset();
        document.getElementById('montoAdelanto').value = "10.00";
    } catch (error) {
        console.error("Error al registrar adelanto: ", error);
        toast("Hubo un error al registrar el adelanto.", "error");
    }
});
