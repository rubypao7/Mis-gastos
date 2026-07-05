const STORAGE_KEY = "mis-gastos-v1";
const CUENTAS = ["Rubén", "Paola"];
const CATS_BASE = [
  "🍔 Comida", "🚗 Transporte", "🏠 Hogar", "🛍️ Compras",
  "🎉 Ocio", "💊 Salud", "💼 Salario", "💰 Otros",
];

// Marca de tiempo "modificado". Si no la hay, usamos el id (que es un Date.now()).
function marcaMod(o) {
  if (o && typeof o.mod === "number") return o.mod;
  return o && typeof o.id === "number" ? o.id : 0;
}

let pushTimer = null;

// ---- Estado de la interfaz ----
let vista = "Total";            // "Rubén" | "Paola" | "Total"
let periodo = "mes";            // "mes" | "anio" | "todo"
let cursorAnio = new Date().getFullYear();
let cursorMes = new Date().getMonth(); // 0-11
let formTipo = "gasto";
let formCuenta = "Rubén";
let editId = null;
let fijoTipo = "gasto";
let fijoCuenta = "Rubén";
let fijoEditId = null;

// ---- Elementos ----
const form = document.getElementById("form");
const descInput = document.getElementById("descripcion");
const montoInput = document.getElementById("monto");
const categoriaInput = document.getElementById("categoria");
const fechaInput = document.getElementById("fecha");
const lista = document.getElementById("lista");
const vacio = document.getElementById("vacio");
const balanceEl = document.getElementById("balance");
const balanceLabelEl = document.getElementById("balance-label");
const ingresosEl = document.getElementById("total-ingresos");
const gastosEl = document.getElementById("total-gastos");
const tipoBtns = document.querySelectorAll(".tipo-btn");
const cuentaSelBtns = document.querySelectorAll(".cuenta-sel");
const cuentaTabs = document.querySelectorAll(".cuenta-tab");
const periodoToggleBtns = document.querySelectorAll("#periodo-toggle button");
const periodoNav = document.getElementById("periodo-nav");
const periodoLabel = document.getElementById("periodo-label");
const resumenEl = document.getElementById("resumen");
const listaTitulo = document.getElementById("lista-titulo");
const submitBtn = document.getElementById("submit-btn");
const cancelBtn = document.getElementById("cancel-btn");
const syncBar = document.getElementById("sync-bar");
const syncStatus = document.getElementById("sync-status");
const btnCuenta = document.getElementById("btn-cuenta");
const btnRefrescar = document.getElementById("btn-refrescar");
const syncMsg = document.getElementById("sync-msg");

// ---- Utilidades ----
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function formatear(n) {
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function hoyISO() {
  return aISO(new Date());
}

function aISO(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${da}`;
}

function isoDeId(id) {
  const d = new Date(typeof id === "number" ? id : Date.now());
  return isNaN(d.getTime()) ? hoyISO() : aISO(d);
}

function fechaCorta(iso) {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("es", { day: "numeric", month: "short" });
}

function mesNombre(i) {
  return new Date(2000, i, 1).toLocaleDateString("es", { month: "long" });
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function textoError(e) {
  return e && e.message ? e.message : String(e);
}

// ---- Datos { movimientos: [], updatedAt: ms } ----
// Los movimientos sin cuenta válida se descartan (empezamos de cero).
function normalizarMovs(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((m) => m && CUENTAS.includes(m.cuenta) && typeof m.monto === "number")
    .map((m) => ({
      id: m.id,
      fecha: typeof m.fecha === "string" && m.fecha.length === 10 ? m.fecha : isoDeId(m.id),
      descripcion: String(m.descripcion || ""),
      monto: m.monto,
      categoria: m.categoria || "💰 Otros",
      tipo: m.tipo === "ingreso" ? "ingreso" : "gasto",
      cuenta: m.cuenta,
      mod: marcaMod(m),
    }));
}

// Un "fijo" se repite cada mes. Su importe y su estado (activo/inactivo) se
// guardan por meses: cada cambio vale desde su mes en adelante.
function normalizarFijos(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((f) => f && CUENTAS.includes(f.cuenta) && Array.isArray(f.cambios) && f.cambios.length)
    .map((f) => {
      const cambios = f.cambios
        .filter((c) => c && typeof c.monto === "number" && typeof c.mes === "string")
        .map((c) => ({ mes: c.mes, monto: c.monto, activo: c.activo !== false }))
        .sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
      return {
        id: f.id,
        descripcion: String(f.descripcion || ""),
        categoria: f.categoria || "💰 Otros",
        cuenta: f.cuenta,
        tipo: f.tipo === "ingreso" ? "ingreso" : "gasto",
        desde: typeof f.desde === "string" ? f.desde : (cambios[0] && cambios[0].mes) || mesActualStr(),
        cambios,
        mod: marcaMod(f),
      };
    })
    .filter((f) => f.cambios.length);
}

// Un "aviso" recuerda un gasto anual (impuesto, etc.) en un mes concreto.
function normalizarAvisos(arr) {
  if (!Array.isArray(arr)) return [];
  const anioPasado = new Date().getFullYear() - 1;
  return arr
    .filter((a) => a && CUENTAS.includes(a.cuenta) && +a.mes >= 1 && +a.mes <= 12)
    .map((a) => ({
      id: a.id,
      descripcion: String(a.descripcion || ""),
      mes: +a.mes,
      cuenta: a.cuenta,
      importe: typeof a.importe === "number" ? a.importe : 0,
      anio: typeof a.anio === "number" ? a.anio : anioPasado,
      activo: a.activo !== false,
      hechoAnio: typeof a.hechoAnio === "number" ? a.hechoAnio : 0,
      mod: marcaMod(a),
    }));
}

// Categorías propias que la usuaria haya creado (además de las básicas).
function normalizarCategorias(arr) {
  if (!Array.isArray(arr)) return [];
  const vistas = new Set();
  const out = [];
  for (const c of arr) {
    const s = String(c || "").trim();
    if (s && !vistas.has(s)) {
      vistas.add(s);
      out.push(s);
    }
  }
  return out;
}

// "Lápidas" de borrado: { mov:{id:ts}, fijo:{...}, aviso:{...} }.
function normalizarBorrados(o) {
  const r = { mov: {}, fijo: {}, aviso: {} };
  if (!o || typeof o !== "object") return r;
  for (const k of ["mov", "fijo", "aviso"]) {
    const src = o[k];
    if (src && typeof src === "object") {
      for (const id in src) {
        if (typeof src[id] === "number") r[k][id] = src[id];
      }
    }
  }
  return r;
}

function datosVacios() {
  return { movimientos: [], fijos: [], avisos: [], categorias: [], borrados: normalizarBorrados(null), updatedAt: 0 };
}

function leerLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw) return datosVacios();
    const arr = Array.isArray(raw) ? raw : raw.movimientos;
    return {
      movimientos: normalizarMovs(arr),
      fijos: normalizarFijos(raw && raw.fijos),
      avisos: normalizarAvisos(raw && raw.avisos),
      categorias: normalizarCategorias(raw && raw.categorias),
      borrados: normalizarBorrados(raw && raw.borrados),
      updatedAt: (raw && raw.updatedAt) || 0,
    };
  } catch {
    return datosVacios();
  }
}

function mesActualStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function mesStr(y, m) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function mesLargo(ms) {
  const [y, mo] = ms.split("-").map(Number);
  return cap(new Date(y, mo - 1, 1).toLocaleDateString("es", { month: "long", year: "numeric" }));
}

function ultimoCambio(f) {
  return f.cambios[f.cambios.length - 1];
}

// Estado (importe + activo) que rige un mes concreto: el último cambio cuya
// fecha sea <= ese mes. Si el mes es anterior al inicio del fijo, no aplica.
function estadoFijoEnMes(f, ms) {
  if (ms < f.desde) return null;
  let est = null;
  for (const c of f.cambios) {
    if (c.mes <= ms) est = c;
    else break;
  }
  return est;
}

function activoEsteMes(f) {
  const e = estadoFijoEnMes(f, mesActualStr());
  return e ? e.activo : ultimoCambio(f).activo;
}

function fijosDelMes(y, m) {
  const ms = mesStr(y, m);
  const out = [];
  for (const f of datos.fijos) {
    const est = estadoFijoEnMes(f, ms);
    if (est && est.activo) {
      out.push({
        id: `fijo-${f.id}-${ms}`,
        fijo: true,
        fijoId: f.id,
        fecha: `${ms}-01`,
        descripcion: f.descripcion,
        monto: est.monto,
        categoria: f.categoria,
        tipo: f.tipo,
        cuenta: f.cuenta,
      });
    }
  }
  return out;
}

// Meses en los que generamos fijos para el periodo actual (nunca hacia el futuro).
function celdasFijos() {
  const ahora = new Date();
  const yA = ahora.getFullYear();
  const mA = ahora.getMonth();
  const noFuturo = (y, m) => y < yA || (y === yA && m <= mA);
  const cells = [];
  if (periodo === "mes") {
    if (noFuturo(cursorAnio, cursorMes)) cells.push([cursorAnio, cursorMes]);
  } else if (periodo === "anio") {
    for (let m = 0; m < 12; m++) if (noFuturo(cursorAnio, m)) cells.push([cursorAnio, m]);
  } else if (datos.fijos.length) {
    let min = datos.fijos.reduce((a, f) => (f.desde < a ? f.desde : a), datos.fijos[0].desde);
    let y = +min.slice(0, 4);
    let m = +min.slice(5, 7) - 1;
    while (noFuturo(y, m)) {
      cells.push([y, m]);
      if (++m > 11) {
        m = 0;
        y++;
      }
    }
  }
  return cells;
}

function virtualesFiltrados() {
  const out = [];
  for (const [y, m] of celdasFijos()) {
    for (const v of fijosDelMes(y, m)) {
      if (vista === "Total" || v.cuenta === vista) out.push(v);
    }
  }
  return out;
}

let datos = leerLocal();

// Recoge en la lista de categorías las que ya se usan en movimientos o fijos,
// para que aparezcan en los desplegables aunque no se guardaran como "propias".
function cosecharCategorias() {
  const set = new Set(datos.categorias);
  for (const m of datos.movimientos) if (m.categoria && !CATS_BASE.includes(m.categoria)) set.add(m.categoria);
  for (const f of datos.fijos) if (f.categoria && !CATS_BASE.includes(f.categoria)) set.add(f.categoria);
  datos.categorias = [...set];
}
cosecharCategorias();

function guardarLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
}

// ---- Categorías (básicas + propias) en los desplegables ----
function todasCategorias() {
  return CATS_BASE.concat(datos.categorias.filter((c) => !CATS_BASE.includes(c)));
}

function poblarSelect(sel, seleccion) {
  if (!sel) return;
  const val = seleccion != null ? seleccion : sel.value;
  const cats = todasCategorias();
  if (val && val !== "__nueva__" && !cats.includes(val)) cats.push(val); // no perder una categoría antigua
  sel.innerHTML = "";
  for (const c of cats) {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  }
  const nueva = document.createElement("option");
  nueva.value = "__nueva__";
  nueva.textContent = "➕ Nueva categoría…";
  sel.appendChild(nueva);
  if (val && val !== "__nueva__") sel.value = val;
  sel.dataset.prev = sel.value;
}

function poblarCategorias() {
  poblarSelect(categoriaInput, categoriaInput.value);
  poblarSelect(fijoCatInput, fijoCatInput.value);
}

function onNuevaCategoria(sel) {
  if (sel.value !== "__nueva__") {
    sel.dataset.prev = sel.value;
    return;
  }
  const nom = (window.prompt("Nombre de la nueva categoría (puedes poner un emoji delante):") || "").trim();
  if (!nom) {
    sel.value = sel.dataset.prev || CATS_BASE[0];
    return;
  }
  if (!todasCategorias().includes(nom)) {
    mutar(() => datos.categorias.push(nom));
  }
  poblarSelect(categoriaInput, categoriaInput === sel ? nom : categoriaInput.value);
  poblarSelect(fijoCatInput, fijoCatInput === sel ? nom : fijoCatInput.value);
}

function mutar(fn) {
  fn();
  datos.updatedAt = Date.now();
  guardarLocal();
  render();
  programarSubida();
}

// ---- Filtros y cálculos ----
function coincidePeriodo(m) {
  const y = +m.fecha.slice(0, 4);
  const mo = +m.fecha.slice(5, 7) - 1;
  if (periodo === "mes") return y === cursorAnio && mo === cursorMes;
  if (periodo === "anio") return y === cursorAnio;
  return true;
}

function movsVista(m) {
  return vista === "Total" || m.cuenta === vista;
}

function movsFiltrados() {
  const reales = datos.movimientos.filter((m) => movsVista(m) && coincidePeriodo(m));
  return reales.concat(virtualesFiltrados());
}

function totales(movs) {
  let ingresos = 0;
  let gastos = 0;
  for (const m of movs) {
    if (m.tipo === "ingreso") ingresos += m.monto;
    else gastos += m.monto;
  }
  return { ingresos, gastos, saldo: ingresos - gastos };
}

// ---- Render ----
function render() {
  renderControles();
  const movs = movsFiltrados();
  const t = totales(movs);

  balanceLabelEl.textContent = vista === "Total" ? "Saldo total" : "Saldo de " + vista;
  balanceEl.textContent = formatear(t.saldo);
  balanceEl.className = "balance-amount" + (t.saldo < 0 ? " negativo" : "");
  ingresosEl.textContent = formatear(t.ingresos);
  gastosEl.textContent = formatear(t.gastos);

  renderResumen(movs);
  renderLista(movs);
  renderFijos();
  renderAvisosBanner();
  renderAvisos();
}

function renderControles() {
  cuentaTabs.forEach((b) => b.classList.toggle("active", b.dataset.vista === vista));
  periodoToggleBtns.forEach((b) => b.classList.toggle("active", b.dataset.periodo === periodo));

  if (periodo === "todo") {
    periodoNav.classList.add("oculto");
  } else {
    periodoNav.classList.remove("oculto");
    if (periodo === "mes") {
      const lbl = new Date(cursorAnio, cursorMes, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
      periodoLabel.textContent = cap(lbl);
    } else {
      periodoLabel.textContent = String(cursorAnio);
    }
  }
}

function bloque(titulo) {
  const card = el("div", "res-card");
  card.appendChild(el("h3", "res-titulo", titulo));
  return card;
}

function renderResumen(movs) {
  resumenEl.innerHTML = "";

  // Por cuenta (solo en la vista Total)
  if (vista === "Total") {
    const card = bloque("Por cuenta");
    const grid = el("div", "cuentas-grid");
    for (const c of CUENTAS) {
      const t = totales(movs.filter((m) => m.cuenta === c));
      const box = el("div", "cuenta-box " + (c === "Rubén" ? "box-ruben" : "box-paola"));
      box.appendChild(el("div", "cuenta-nombre", c));
      const saldo = el("div", "cuenta-saldo" + (t.saldo < 0 ? " negativo" : ""), formatear(t.saldo));
      box.appendChild(saldo);
      const det = el("div", "cuenta-det");
      det.appendChild(el("span", "ingreso", "▲ " + formatear(t.ingresos)));
      det.appendChild(el("span", "gasto", "▼ " + formatear(t.gastos)));
      box.appendChild(det);
      grid.appendChild(box);
    }
    card.appendChild(grid);
    resumenEl.appendChild(card);
  }

  // Gastos por categoría
  const porCat = {};
  for (const m of movs) if (m.tipo === "gasto") porCat[m.categoria] = (porCat[m.categoria] || 0) + m.monto;
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  if (cats.length) {
    const totalGastos = cats.reduce((s, [, v]) => s + v, 0);
    const card = bloque("Gastos por categoría");
    for (const [cat, val] of cats) {
      const pct = totalGastos ? Math.round((val / totalGastos) * 100) : 0;
      const row = el("div", "cat-row");
      row.appendChild(el("span", "cat-nombre", cat));
      const bar = el("div", "cat-bar");
      const fill = el("div", "cat-fill");
      fill.style.width = pct + "%";
      bar.appendChild(fill);
      row.appendChild(bar);
      const m = el("span", "cat-monto");
      m.appendChild(el("span", null, formatear(val)));
      m.appendChild(el("span", "cat-pct", pct + "%"));
      row.appendChild(m);
      card.appendChild(row);
    }
    resumenEl.appendChild(card);
  }

  // Desglose por mes (vista anual)
  if (periodo === "anio") {
    const card = bloque("Por mes");
    for (let i = 0; i < 12; i++) {
      const mm = movs.filter((m) => +m.fecha.slice(5, 7) - 1 === i);
      if (!mm.length) continue;
      card.appendChild(filaPeriodo(cap(mesNombre(i)), totales(mm)));
    }
    if (card.children.length > 1) resumenEl.appendChild(card);
  }

  // Desglose por año (vista "todo")
  if (periodo === "todo") {
    const porAnio = {};
    for (const m of movs) (porAnio[+m.fecha.slice(0, 4)] ||= []).push(m);
    const anios = Object.keys(porAnio).map(Number).sort((a, b) => b - a);
    if (anios.length) {
      const card = bloque("Por año");
      for (const a of anios) card.appendChild(filaPeriodo(String(a), totales(porAnio[a])));
      resumenEl.appendChild(card);
    }
  }
}

function filaPeriodo(nombre, t) {
  const row = el("div", "mes-row");
  row.appendChild(el("span", "mes-nombre", nombre));
  const det = el("div", "mes-det");
  det.appendChild(el("span", "ingreso", "+" + formatear(t.ingresos)));
  det.appendChild(el("span", "gasto", "-" + formatear(t.gastos)));
  det.appendChild(el("span", "mes-saldo" + (t.saldo < 0 ? " negativo" : ""), formatear(t.saldo)));
  row.appendChild(det);
  return row;
}

function renderLista(movs) {
  lista.innerHTML = "";
  listaTitulo.textContent = "Movimientos (" + movs.length + ")";
  const orden = [...movs].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id));

  for (const m of orden) {
    const li = el("li", "item");

    if (m.fijo) li.classList.add("item-fijo");

    const info = el("div", "item-info");
    info.appendChild(el("div", "item-desc", m.descripcion));
    const meta = el("div", "item-cat");
    meta.appendChild(el("span", "item-fecha", fechaCorta(m.fecha)));
    meta.appendChild(el("span", null, " · " + m.categoria));
    info.appendChild(meta);
    info.addEventListener("click", m.fijo ? abrirFijos : () => editar(m.id));
    li.appendChild(info);

    if (m.fijo) li.appendChild(el("span", "fijo-tag", "🔁 fijo"));
    if (vista === "Total") {
      li.appendChild(el("span", "cuenta-tag " + (m.cuenta === "Rubén" ? "tag-ruben" : "tag-paola"), m.cuenta));
    }

    li.appendChild(el("span", "item-monto " + m.tipo, (m.tipo === "ingreso" ? "+" : "-") + formatear(m.monto)));

    if (!m.fijo) {
      const del = el("button", "borrar", "✕");
      del.setAttribute("aria-label", "Borrar");
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        borrar(m.id);
      });
      li.appendChild(del);
    }

    lista.appendChild(li);
  }
  vacio.classList.toggle("oculto", orden.length > 0);
}

// ---- Acciones de movimientos ----
function borrar(id) {
  const m = datos.movimientos.find((x) => x.id === id);
  if (m && !window.confirm('¿Borrar "' + m.descripcion + '"?')) return;
  if (editId === id) cancelarEdicion();
  mutar(() => {
    datos.movimientos = datos.movimientos.filter((x) => x.id !== id);
    datos.borrados.mov[id] = Date.now();
  });
}

function editar(id) {
  const m = datos.movimientos.find((x) => x.id === id);
  if (!m) return;
  editId = id;
  formTipo = m.tipo;
  formCuenta = m.cuenta;
  actualizarToggles();
  descInput.value = m.descripcion;
  montoInput.value = m.monto;
  categoriaInput.value = m.categoria;
  fechaInput.value = m.fecha;
  submitBtn.textContent = "Guardar cambios";
  cancelBtn.classList.remove("oculto");
  form.classList.add("editando");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  descInput.focus();
}

function cancelarEdicion() {
  editId = null;
  form.reset();
  restablecerForm();
  submitBtn.textContent = "Añadir";
  cancelBtn.classList.add("oculto");
  form.classList.remove("editando");
}

function restablecerForm() {
  formTipo = "gasto";
  formCuenta = vista === "Total" ? formCuenta : vista;
  fechaInput.value = hoyISO();
  actualizarToggles();
}

function actualizarToggles() {
  tipoBtns.forEach((b) => b.classList.toggle("active", b.dataset.tipo === formTipo));
  cuentaSelBtns.forEach((b) => b.classList.toggle("active", b.dataset.cuenta === formCuenta));
}

// ---- Eventos de la interfaz ----
cuentaTabs.forEach((b) =>
  b.addEventListener("click", () => {
    vista = b.dataset.vista;
    if (editId !== null) cancelarEdicion();
    if (vista !== "Total") {
      formCuenta = vista;
      actualizarToggles();
    }
    render();
  })
);

periodoToggleBtns.forEach((b) =>
  b.addEventListener("click", () => {
    periodo = b.dataset.periodo;
    render();
  })
);

document.getElementById("periodo-prev").addEventListener("click", () => moverPeriodo(-1));
document.getElementById("periodo-next").addEventListener("click", () => moverPeriodo(1));

function moverPeriodo(dir) {
  if (periodo === "mes") {
    cursorMes += dir;
    if (cursorMes < 0) {
      cursorMes = 11;
      cursorAnio--;
    } else if (cursorMes > 11) {
      cursorMes = 0;
      cursorAnio++;
    }
  } else if (periodo === "anio") {
    cursorAnio += dir;
  }
  render();
}

tipoBtns.forEach((b) =>
  b.addEventListener("click", () => {
    formTipo = b.dataset.tipo;
    actualizarToggles();
  })
);

cuentaSelBtns.forEach((b) =>
  b.addEventListener("click", () => {
    formCuenta = b.dataset.cuenta;
    actualizarToggles();
  })
);

cancelBtn.addEventListener("click", cancelarEdicion);

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const monto = parseFloat(montoInput.value);
  const fecha = fechaInput.value || hoyISO();
  if (!descInput.value.trim() || isNaN(monto) || monto <= 0) return;

  mutar(() => {
    if (editId !== null) {
      const m = datos.movimientos.find((x) => x.id === editId);
      if (m) {
        m.descripcion = descInput.value.trim();
        m.monto = monto;
        m.categoria = categoriaInput.value;
        m.tipo = formTipo;
        m.cuenta = formCuenta;
        m.fecha = fecha;
        m.mod = Date.now();
      }
    } else {
      datos.movimientos.unshift({
        id: Date.now(),
        fecha,
        descripcion: descInput.value.trim(),
        monto,
        categoria: categoriaInput.value,
        tipo: formTipo,
        cuenta: formCuenta,
        mod: Date.now(),
      });
    }
  });

  editId = null;
  form.reset();
  restablecerForm();
  submitBtn.textContent = "Añadir";
  cancelBtn.classList.add("oculto");
  form.classList.remove("editando");
  descInput.focus();
});

// ---- Fijos mensuales ----
const fijosOverlay = document.getElementById("fijos-overlay");
const fijosListaEl = document.getElementById("fijos-lista");
const fijoForm = document.getElementById("fijo-form");
const fijoDescInput = document.getElementById("fijo-desc");
const fijoMontoInput = document.getElementById("fijo-monto");
const fijoCatInput = document.getElementById("fijo-cat");
const fijoDesdeInput = document.getElementById("fijo-desde");
const fijoDesdeCampo = document.getElementById("fijo-desde-campo");
const fijoSubmitBtn = document.getElementById("fijo-submit");
const fijoCancelBtn = document.getElementById("fijo-cancel");
const fijoFormTitulo = document.getElementById("fijo-form-titulo");
const fijoTipoBtns = document.querySelectorAll(".ftipo-btn");
const fijoCuentaBtns = document.querySelectorAll(".fcuenta-sel");

function abrirFijos() {
  resetFijoForm();
  renderFijos();
  fijosOverlay.classList.remove("oculto");
}

function cerrarFijos() {
  fijosOverlay.classList.add("oculto");
}

function actualizarFijoToggles() {
  fijoTipoBtns.forEach((b) => b.classList.toggle("active", b.dataset.tipo === fijoTipo));
  fijoCuentaBtns.forEach((b) => b.classList.toggle("active", b.dataset.cuenta === fijoCuenta));
}

function resetFijoForm() {
  fijoEditId = null;
  fijoForm.reset();
  fijoTipo = "gasto";
  fijoCuenta = "Rubén";
  actualizarFijoToggles();
  fijoDesdeInput.value = mesActualStr();
  fijoDesdeCampo.classList.remove("oculto");
  fijoFormTitulo.textContent = "Añadir fijo";
  fijoSubmitBtn.textContent = "Añadir fijo";
  fijoCancelBtn.classList.add("oculto");
}

function renderFijos() {
  if (!fijosListaEl) return;
  fijosListaEl.innerHTML = "";
  if (!datos.fijos.length) {
    fijosListaEl.appendChild(el("p", "panel-vacio", "Aún no has configurado ningún fijo."));
    return;
  }
  for (const f of datos.fijos) {
    const uc = ultimoCambio(f);
    const activo = uc.activo;
    const li = el("li", "fijo-item" + (activo ? "" : " inactivo"));

    const top = el("div", "fijo-top");
    const izq = el("div", "fijo-info");
    izq.appendChild(el("div", "fijo-desc", f.descripcion));
    const meta = el("div", "fijo-meta");
    meta.appendChild(el("span", "cuenta-tag " + (f.cuenta === "Rubén" ? "tag-ruben" : "tag-paola"), f.cuenta));
    meta.appendChild(el("span", null, f.categoria));
    izq.appendChild(meta);
    top.appendChild(izq);
    top.appendChild(el("div", "fijo-monto " + f.tipo, (f.tipo === "ingreso" ? "+" : "-") + formatear(uc.monto)));
    li.appendChild(top);

    if (!activo) li.appendChild(el("div", "fijo-estado", "Desactivado desde " + mesLargo(uc.mes)));

    const acciones = el("div", "fijo-acciones");
    const bEdit = el("button", "fijo-btn", "Editar");
    bEdit.addEventListener("click", () => editarFijo(f.id));
    const bTog = el("button", "fijo-btn " + (activo ? "btn-off" : "btn-on"), activo ? "Desactivar" : "Activar");
    bTog.addEventListener("click", () => alternarFijo(f.id));
    const bDel = el("button", "fijo-btn btn-del", "Eliminar");
    bDel.addEventListener("click", () => eliminarFijo(f.id));
    acciones.appendChild(bEdit);
    acciones.appendChild(bTog);
    acciones.appendChild(bDel);
    li.appendChild(acciones);

    fijosListaEl.appendChild(li);
  }
}

function agregarCambio(f, ms, monto, activo) {
  const i = f.cambios.findIndex((c) => c.mes === ms);
  const nuevo = { mes: ms, monto, activo };
  if (i >= 0) f.cambios[i] = nuevo;
  else {
    f.cambios.push(nuevo);
    f.cambios.sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
  }
}

function editarFijo(id) {
  const f = datos.fijos.find((x) => x.id === id);
  if (!f) return;
  fijoEditId = id;
  fijoTipo = f.tipo;
  fijoCuenta = f.cuenta;
  actualizarFijoToggles();
  fijoDescInput.value = f.descripcion;
  fijoMontoInput.value = ultimoCambio(f).monto;
  fijoCatInput.value = f.categoria;
  fijoDesdeCampo.classList.add("oculto");
  fijoFormTitulo.textContent = "Editar fijo (cambios desde " + mesLargo(mesActualStr()) + ")";
  fijoSubmitBtn.textContent = "Guardar cambios";
  fijoCancelBtn.classList.remove("oculto");
  fijoForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function alternarFijo(id) {
  const f = datos.fijos.find((x) => x.id === id);
  if (!f) return;
  const uc = ultimoCambio(f);
  mutar(() => {
    agregarCambio(f, mesActualStr(), uc.monto, !activoEsteMes(f));
    f.mod = Date.now();
  });
}

function eliminarFijo(id) {
  const f = datos.fijos.find((x) => x.id === id);
  if (!f) return;
  if (!window.confirm('¿Eliminar el fijo "' + f.descripcion + '"? Desaparecerá de todos los meses.')) return;
  mutar(() => {
    datos.fijos = datos.fijos.filter((x) => x.id !== id);
    datos.borrados.fijo[id] = Date.now();
  });
}

fijoTipoBtns.forEach((b) =>
  b.addEventListener("click", () => {
    fijoTipo = b.dataset.tipo;
    actualizarFijoToggles();
  })
);
fijoCuentaBtns.forEach((b) =>
  b.addEventListener("click", () => {
    fijoCuenta = b.dataset.cuenta;
    actualizarFijoToggles();
  })
);

document.getElementById("fijos-abrir").addEventListener("click", abrirFijos);
document.getElementById("fijos-cerrar").addEventListener("click", cerrarFijos);
fijoCancelBtn.addEventListener("click", resetFijoForm);

fijoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const monto = parseFloat(fijoMontoInput.value);
  const desc = fijoDescInput.value.trim();
  if (!desc || isNaN(monto) || monto <= 0) return;

  mutar(() => {
    if (fijoEditId !== null) {
      const f = datos.fijos.find((x) => x.id === fijoEditId);
      if (f) {
        f.descripcion = desc;
        f.categoria = fijoCatInput.value;
        f.cuenta = fijoCuenta;
        f.tipo = fijoTipo;
        // El cambio de importe vale desde este mes; conserva el estado activo actual.
        agregarCambio(f, mesActualStr(), monto, activoEsteMes(f));
        f.mod = Date.now();
      }
    } else {
      const desde = fijoDesdeInput.value || mesActualStr();
      datos.fijos.push({
        id: Date.now(),
        descripcion: desc,
        categoria: fijoCatInput.value,
        cuenta: fijoCuenta,
        tipo: fijoTipo,
        desde,
        cambios: [{ mes: desde, monto, activo: true }],
        mod: Date.now(),
      });
    }
  });
  resetFijoForm();
});

// ---- Centro de avisos ----
const avisosOverlay = document.getElementById("avisos-overlay");
const avisosBannerEl = document.getElementById("avisos-banner");
const avisosListaEl = document.getElementById("avisos-lista");
const avisoForm = document.getElementById("aviso-form");
const avisoDescInput = document.getElementById("aviso-desc");
const avisoMesInput = document.getElementById("aviso-mes");
const avisoImporteInput = document.getElementById("aviso-importe");
const avisoAnioInput = document.getElementById("aviso-anio");
const avisoSubmitBtn = document.getElementById("aviso-submit");
const avisoCancelBtn = document.getElementById("aviso-cancel");
const avisoFormTitulo = document.getElementById("aviso-form-titulo");
const avisoCuentaBtns = document.querySelectorAll(".acuenta-sel");

let avisoCuenta = "Rubén";
let avisoEditId = null;

function abrirAvisos() {
  resetAvisoForm();
  renderAvisos();
  avisosOverlay.classList.remove("oculto");
}

function cerrarAvisos() {
  avisosOverlay.classList.add("oculto");
}

function actualizarAvisoToggles() {
  avisoCuentaBtns.forEach((b) => b.classList.toggle("active", b.dataset.cuenta === avisoCuenta));
}

function resetAvisoForm() {
  avisoEditId = null;
  avisoForm.reset();
  avisoCuenta = "Rubén";
  actualizarAvisoToggles();
  avisoMesInput.value = String(new Date().getMonth() + 1);
  avisoAnioInput.value = String(new Date().getFullYear() - 1);
  avisoFormTitulo.textContent = "Añadir aviso";
  avisoSubmitBtn.textContent = "Añadir aviso";
  avisoCancelBtn.classList.add("oculto");
}

// Avisos que tocan este mes (o el que viene como anticipo) y no están hechos este año.
function avisosBanner() {
  const ahora = new Date();
  const mesActual = ahora.getMonth() + 1;
  const anioActual = ahora.getFullYear();
  const mesSiguiente = (mesActual % 12) + 1;
  const out = [];
  for (const a of datos.avisos) {
    if (!a.activo || a.hechoAnio === anioActual) continue;
    if (a.mes === mesActual) out.push({ aviso: a, cuando: "este" });
    else if (a.mes === mesSiguiente) out.push({ aviso: a, cuando: "siguiente" });
  }
  return out;
}

function renderAvisosBanner() {
  if (!avisosBannerEl) return;
  avisosBannerEl.innerHTML = "";
  const items = avisosBanner();
  for (const { aviso: a, cuando } of items) {
    const card = el("div", "aviso-card" + (cuando === "siguiente" ? " aviso-proximo" : ""));
    const cab = el("div", "aviso-cab");
    cab.appendChild(el("span", "aviso-icono", cuando === "este" ? "🔔" : "📅"));
    const texto = el("div", "aviso-texto");
    texto.appendChild(el("div", "aviso-desc", a.descripcion));
    const sub =
      (cuando === "este" ? "Este mes" : "El mes que viene (" + cap(mesNombre(a.mes - 1)) + ")") +
      " · " +
      a.cuenta +
      (a.importe > 0 ? " · el año pasado: " + formatear(a.importe) + " (" + a.anio + ")" : "");
    texto.appendChild(el("div", "aviso-sub", sub));
    cab.appendChild(texto);
    card.appendChild(cab);

    const acciones = el("div", "aviso-acciones");
    const bReg = el("button", "aviso-btn aviso-reg", "Registrar gasto");
    bReg.addEventListener("click", () => registrarDesdeAviso(a.id));
    const bHecho = el("button", "aviso-btn", "Hecho este año");
    bHecho.addEventListener("click", () => marcarHecho(a.id));
    acciones.appendChild(bReg);
    acciones.appendChild(bHecho);
    card.appendChild(acciones);

    avisosBannerEl.appendChild(card);
  }
}

function renderAvisos() {
  if (!avisosListaEl) return;
  avisosListaEl.innerHTML = "";
  if (!datos.avisos.length) {
    avisosListaEl.appendChild(el("p", "panel-vacio", "Aún no has creado ningún aviso."));
    return;
  }
  const orden = [...datos.avisos].sort((a, b) => a.mes - b.mes);
  for (const a of orden) {
    const li = el("li", "fijo-item" + (a.activo ? "" : " inactivo"));
    const top = el("div", "fijo-top");
    const izq = el("div", "fijo-info");
    izq.appendChild(el("div", "fijo-desc", a.descripcion));
    const meta = el("div", "fijo-meta");
    meta.appendChild(el("span", "cuenta-tag " + (a.cuenta === "Rubén" ? "tag-ruben" : "tag-paola"), a.cuenta));
    meta.appendChild(el("span", null, cap(mesNombre(a.mes - 1))));
    izq.appendChild(meta);
    top.appendChild(izq);
    if (a.importe > 0) top.appendChild(el("div", "fijo-monto gasto", "≈ " + formatear(a.importe)));
    li.appendChild(top);

    if (a.importe > 0) li.appendChild(el("div", "aviso-ref", "Referencia del año " + a.anio));

    const acciones = el("div", "fijo-acciones");
    const bEdit = el("button", "fijo-btn", "Editar");
    bEdit.addEventListener("click", () => editarAviso(a.id));
    const bTog = el("button", "fijo-btn " + (a.activo ? "btn-off" : "btn-on"), a.activo ? "Desactivar" : "Activar");
    bTog.addEventListener("click", () => alternarAviso(a.id));
    const bDel = el("button", "fijo-btn btn-del", "Eliminar");
    bDel.addEventListener("click", () => eliminarAviso(a.id));
    acciones.appendChild(bEdit);
    acciones.appendChild(bTog);
    acciones.appendChild(bDel);
    li.appendChild(acciones);

    avisosListaEl.appendChild(li);
  }
}

function registrarDesdeAviso(id) {
  const a = datos.avisos.find((x) => x.id === id);
  if (!a) return;
  cerrarAvisos();
  editId = null;
  formTipo = "gasto";
  formCuenta = a.cuenta;
  actualizarToggles();
  descInput.value = a.descripcion;
  montoInput.value = a.importe > 0 ? a.importe : "";
  categoriaInput.value = "💰 Otros";
  fechaInput.value = hoyISO();
  submitBtn.textContent = "Añadir";
  cancelBtn.classList.add("oculto");
  form.classList.remove("editando");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  montoInput.focus();
}

function marcarHecho(id) {
  const a = datos.avisos.find((x) => x.id === id);
  if (!a) return;
  mutar(() => {
    a.hechoAnio = new Date().getFullYear();
    a.mod = Date.now();
  });
}

function editarAviso(id) {
  const a = datos.avisos.find((x) => x.id === id);
  if (!a) return;
  avisoEditId = id;
  avisoCuenta = a.cuenta;
  actualizarAvisoToggles();
  avisoDescInput.value = a.descripcion;
  avisoMesInput.value = String(a.mes);
  avisoImporteInput.value = a.importe > 0 ? a.importe : "";
  avisoAnioInput.value = String(a.anio);
  avisoFormTitulo.textContent = "Editar aviso";
  avisoSubmitBtn.textContent = "Guardar cambios";
  avisoCancelBtn.classList.remove("oculto");
  avisoForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function alternarAviso(id) {
  const a = datos.avisos.find((x) => x.id === id);
  if (!a) return;
  mutar(() => {
    a.activo = !a.activo;
    a.mod = Date.now();
  });
}

function eliminarAviso(id) {
  const a = datos.avisos.find((x) => x.id === id);
  if (!a) return;
  if (!window.confirm('¿Eliminar el aviso "' + a.descripcion + '"?')) return;
  mutar(() => {
    datos.avisos = datos.avisos.filter((x) => x.id !== id);
    datos.borrados.aviso[id] = Date.now();
  });
}

avisoCuentaBtns.forEach((b) =>
  b.addEventListener("click", () => {
    avisoCuenta = b.dataset.cuenta;
    actualizarAvisoToggles();
  })
);

document.getElementById("avisos-abrir").addEventListener("click", abrirAvisos);
document.getElementById("avisos-cerrar").addEventListener("click", cerrarAvisos);
avisoCancelBtn.addEventListener("click", resetAvisoForm);

avisoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const desc = avisoDescInput.value.trim();
  if (!desc) return;
  const importe = parseFloat(avisoImporteInput.value);
  const anio = parseInt(avisoAnioInput.value, 10);

  mutar(() => {
    if (avisoEditId !== null) {
      const a = datos.avisos.find((x) => x.id === avisoEditId);
      if (a) {
        a.descripcion = desc;
        a.cuenta = avisoCuenta;
        a.mes = +avisoMesInput.value;
        a.importe = isNaN(importe) ? 0 : importe;
        a.anio = isNaN(anio) ? a.anio : anio;
        a.mod = Date.now();
      }
    } else {
      datos.avisos.push({
        id: Date.now(),
        descripcion: desc,
        cuenta: avisoCuenta,
        mes: +avisoMesInput.value,
        importe: isNaN(importe) ? 0 : importe,
        anio: isNaN(anio) ? new Date().getFullYear() - 1 : anio,
        activo: true,
        hechoAnio: 0,
        mod: Date.now(),
      });
    }
  });
  resetAvisoForm();
});

// ---- Indicador de sincronización ----
function setEstado(estado, detalle) {
  if (!syncStatus) return;
  const map = {
    "sin-conectar": ["Sin conectar", "badge-gray"],
    sincronizando: ["Sincronizando…", "badge-amber"],
    ok: ["Sincronizado ✓", "badge-green"],
    error: ["⚠️ Error de sincronización", "badge-red"],
  };
  const [texto, clase] = map[estado] || ["", ""];
  syncStatus.textContent = texto;
  syncStatus.className = "badge " + clase;
  syncStatus.title = detalle || texto;

  if (syncMsg) {
    if (estado === "error" && detalle) {
      syncMsg.textContent = detalle;
      syncMsg.classList.remove("oculto");
    } else {
      syncMsg.textContent = "";
      syncMsg.classList.add("oculto");
    }
  }

  const conectado = typeof haySesion === "function" && haySesion();
  btnCuenta.textContent = conectado ? "Desconectar" : "Conectar OneDrive";
  btnCuenta.dataset.accion = conectado ? "desconectar" : "conectar";
  if (btnRefrescar) btnRefrescar.classList.toggle("oculto", !conectado);
}

// ---- Sincronización ----
let sincronizando = false;

async function sincronizar() {
  if (!syncConfigurada() || !haySesion()) return;
  if (sincronizando) return; // evita solaparse consigo misma
  sincronizando = true;
  setEstado("sincronizando");
  try {
    const remoto = await descargarDeNube();
    if (remoto) {
      const remotoNorm = {
        movimientos: normalizarMovs(remoto.movimientos),
        fijos: normalizarFijos(remoto.fijos),
        avisos: normalizarAvisos(remoto.avisos),
        categorias: normalizarCategorias(remoto.categorias),
        borrados: normalizarBorrados(remoto.borrados),
        updatedAt: remoto.updatedAt || 0,
      };
      // Fusión elemento a elemento: no se pierde nada de ningún dispositivo.
      datos = fusionarDatos(datos, remotoNorm);
      cosecharCategorias();
      guardarLocal();
      poblarCategorias();
      render();
    }
    // Subimos el resultado ya fusionado para que la nube quede completa.
    await subirANube(datos);
    setEstado("ok");
  } catch (e) {
    setEstado("error", textoError(e));
  } finally {
    sincronizando = false;
  }
}

// Tras un cambio local, esperamos un poco y hacemos una sincronización completa
// (bajar + fusionar + subir), no una simple subida que podría pisar la nube.
function programarSubida() {
  if (!syncConfigurada() || !haySesion()) return;
  setEstado("sincronizando");
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => sincronizar(), 800);
}

async function arrancarSync() {
  if (!syncConfigurada()) {
    if (syncBar) syncBar.classList.add("oculto");
    return;
  }
  if (syncBar) syncBar.classList.remove("oculto");

  btnCuenta.addEventListener("click", async () => {
    try {
      if (btnCuenta.dataset.accion === "desconectar") {
        await desconectarOneDrive();
      } else {
        setEstado("sincronizando");
        await conectarOneDrive();
      }
    } catch (e) {
      setEstado("error", "No se pudo iniciar sesión: " + textoError(e));
    }
  });

  try {
    await initSync();
  } catch (e) {
    setEstado("error", textoError(e));
    return;
  }

  if (haySesion()) {
    await sincronizar();
  } else {
    setEstado("sin-conectar");
  }
}

// ---- Categorías: listeners ----
categoriaInput.addEventListener("change", () => onNuevaCategoria(categoriaInput));
fijoCatInput.addEventListener("change", () => onNuevaCategoria(fijoCatInput));

// ---- Botón "Actualizar" (baja y fusiona lo de la nube al momento) ----
if (btnRefrescar) btnRefrescar.addEventListener("click", () => sincronizar());

// ---- Inicio ----
poblarCategorias();
restablecerForm();
render();
arrancarSync();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
