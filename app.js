const STORAGE_KEY = "mis-gastos-v1";
const CUENTAS = ["Rubén", "Paola"];

let pushTimer = null;

// ---- Estado de la interfaz ----
let vista = "Total";            // "Rubén" | "Paola" | "Total"
let periodo = "mes";            // "mes" | "anio" | "todo"
let cursorAnio = new Date().getFullYear();
let cursorMes = new Date().getMonth(); // 0-11
let formTipo = "gasto";
let formCuenta = "Rubén";
let editId = null;

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
const syncMsg = document.getElementById("sync-msg");

// ---- Utilidades ----
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function formatear(n) {
  return "$" + n.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    }));
}

function leerLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw) return { movimientos: [], updatedAt: 0 };
    const arr = Array.isArray(raw) ? raw : raw.movimientos;
    return { movimientos: normalizarMovs(arr), updatedAt: (raw && raw.updatedAt) || 0 };
  } catch {
    return { movimientos: [], updatedAt: 0 };
  }
}

let datos = leerLocal();

function guardarLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
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
  return datos.movimientos.filter((m) => movsVista(m) && coincidePeriodo(m));
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

    const info = el("div", "item-info");
    info.appendChild(el("div", "item-desc", m.descripcion));
    const meta = el("div", "item-cat");
    meta.appendChild(el("span", "item-fecha", fechaCorta(m.fecha)));
    meta.appendChild(el("span", null, " · " + m.categoria));
    info.appendChild(meta);
    info.addEventListener("click", () => editar(m.id));
    li.appendChild(info);

    if (vista === "Total") {
      li.appendChild(el("span", "cuenta-tag " + (m.cuenta === "Rubén" ? "tag-ruben" : "tag-paola"), m.cuenta));
    }

    li.appendChild(el("span", "item-monto " + m.tipo, (m.tipo === "ingreso" ? "+" : "-") + formatear(m.monto)));

    const del = el("button", "borrar", "✕");
    del.setAttribute("aria-label", "Borrar");
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      borrar(m.id);
    });
    li.appendChild(del);

    lista.appendChild(li);
  }
  vacio.classList.toggle("oculto", orden.length > 0);
}

// ---- Acciones de movimientos ----
function borrar(id) {
  if (editId === id) cancelarEdicion();
  mutar(() => {
    datos.movimientos = datos.movimientos.filter((m) => m.id !== id);
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
}

// ---- Sincronización ----
async function sincronizar() {
  if (!syncConfigurada() || !haySesion()) return;
  setEstado("sincronizando");
  try {
    const remoto = await descargarDeNube();
    const remotoAt = remoto ? remoto.updatedAt || 0 : -1;

    if (remoto && remotoAt > datos.updatedAt) {
      datos = { movimientos: normalizarMovs(remoto.movimientos), updatedAt: remotoAt };
      guardarLocal();
      render();
    } else if (!remoto || datos.updatedAt > remotoAt) {
      await subirANube(datos);
    }
    setEstado("ok");
  } catch (e) {
    setEstado("error", textoError(e));
  }
}

function programarSubida() {
  if (!syncConfigurada() || !haySesion()) return;
  setEstado("sincronizando");
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      await subirANube(datos);
      setEstado("ok");
    } catch (e) {
      setEstado("error", textoError(e));
    }
  }, 800);
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

// ---- Inicio ----
restablecerForm();
render();
arrancarSync();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
