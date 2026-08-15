export function imprimirEnVistaActual(html) {
    const area = document.getElementById('areaImpresion');
    if (!area) return;

    area.innerHTML = html;

    const limpiar = () => {
        area.innerHTML = '';
        window.removeEventListener('afterprint', limpiar);
    };
    window.addEventListener('afterprint', limpiar);

    window.requestAnimationFrame(() => window.print());
}
