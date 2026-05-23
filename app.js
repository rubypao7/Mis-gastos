const STORAGE_KEY = "mis-gastos-v1";

let movimientos = cargar();
let tipoActual = "gasto";

const form = document.getElementById("form");
const descInput = document.getElementById("descripcion");
const montoInput = document.getElementById("monto");
const categoriaInput = document.getElementById("categoria");
const lista = document.getElementById("lista");
const vacio = document.getElementById("vacio");
const balanceEl = document.getElementById("balance");
const ingresosEl = document.getElementById("total-ingresos");
const gastosEl = document.getElementById("total-gastos");
const tipoBtns = document.querySelectorAll(".tipo-btn");

function cargar() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function guardar() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(movimientos));
}

function formatear(n) {
  return "$" + n.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function render() {
  lista.innerHTML = "";
  let ingresos = 0;
  let gastos = 0;

  for (const m of movimientos) {
    if (m.tipo === "ingreso") ingresos += m.monto;
    else gastos += m.monto;

    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div class="item-info">
        <div class="item-desc"></div>
        <div class="item-cat"></div>
      </div>
      <span class="item-monto ${m.tipo}">${m.tipo === "ingreso" ? "+" : "-"}${formatear(m.monto)}</span>
      <button class="borrar" aria-label="Borrar">✕</button>
    `;
    li.querySelector(".item-desc").textContent = m.descripcion;
    li.querySelector(".item-cat").textContent = m.categoria;
    li.querySelector(".borrar").addEventListener("click", () => borrar(m.id));
    lista.appendChild(li);
  }

  balanceEl.textContent = formatear(ingresos - gastos);
  ingresosEl.textContent = formatear(ingresos);
  gastosEl.textContent = formatear(gastos);
  vacio.classList.toggle("oculto", movimientos.length > 0);
}

function borrar(id) {
  movimientos = movimientos.filter((m) => m.id !== id);
  guardar();
  render();
}

tipoBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    tipoActual = btn.dataset.tipo;
    tipoBtns.forEach((b) => b.classList.toggle("active", b === btn));
  });
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const monto = parseFloat(montoInput.value);
  if (!descInput.value.trim() || isNaN(monto) || monto <= 0) return;

  movimientos.unshift({
    id: Date.now(),
    descripcion: descInput.value.trim(),
    monto,
    categoria: categoriaInput.value,
    tipo: tipoActual,
  });
  guardar();
  render();
  form.reset();
  descInput.focus();
});

render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
