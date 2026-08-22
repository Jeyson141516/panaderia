# UI Specification & Design System — Panadería El Vacán

Este documento define las reglas de interfaz, estados visuales y diseño responsivo para garantizar consistencia entre las vistas del sistema.

---

## 1. Paleta de Colores & Design Tokens
* **Fondo Principal:** `#13151e`
* **Superficie de Tarjetas / Modales:** `#1c1f2e`
* **Bordes Subtildes:** `#2a2e43`
* **Texto Principal:** `#ffffff`
* **Texto Secundario:** `#a0aec0`
* **Verde Éxito / Contado:** `#10b981`
* **Azul Primario / Acción:** `#6366f1`
* **Rojo Alerta / Deuda:** `#ef4444`

---

## 2. Componentes e Interacción Tactil (Móvil)

### Botones de Selección Doble (Contado / Crédito)
- **Estado Inactivo:** Fondo `#282c3f`, texto `#a0aec0`, borde transparente.
- **Estado Activo (Seleccionado):** Fondo `#373d57`, texto `#ffffff`, borde `#6366f1`.
- **Regla Móvil OBLIGATORIA:** Al hacer clic o toque en móvil, el script JS DEBE invocar `.blur()` sobre el elemento. No deben quedar pseudoclases `:focus` ni `:hover` bloqueando el color tras la interacción.

### Selector de Fechas e Inputs
- **Fondo:** `#181a26`
- **Texto:** `#ffffff`
- **Borde Focus:** `1px solid #6366f1` sin sombra azul por defecto del navegador (`outline: none`).

---

## 3. Disposición de Grillas y Tarjetas (Layout)

### Insights Inteligentes (3 Columnas)
- **Escritorio (≥ 1024px):** `display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;`
- **Tablet / Móvil (< 1024px):** `grid-template-columns: 1fr;`
- **Ocultamiento por Rol:** Los elementos que no corresponden al rol activo deben ocultarse usando `display: none` explícito o removiéndose del DOM sin alterar el flujo flex/grid restante.

---

## 4. Estándar de Código para OpenCode
- Siempre que se modifique o cree una vista en JS (`ventas.js`, `reportes.js`), se deben respetar las variables de color y aplicar `.blur()` en eventos táctiles móviles.
- Toda nueva tarjeta de métricas debe mantener padding interno de `1.25rem` y bordes redondeados de `12px`.