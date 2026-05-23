const STORAGE_KEY = "mis-gastos-v1";

let tipoActual = "gasto";
let pushTimer = null;

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
const syncBar = document.getElementById("sync-bar");
const syncStatus = document.getElementById("sync-status");
const btnCuenta = document.getElementById("btn-cuenta");
const syncMsg = document.getElementById("sync-msg");

function textoError(e) {
  return e && e.message ? e.message : String(e);
}

// ---- Datos (formato { movimientos: [], updatedAt: ms }) ----

function leerLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw) return { movimientos: [], updatedAt: 0 };
    if (Array.isArray(raw)) return { movimientos: raw, updatedAt: 0 }; // formato antiguo
    return { movimientos: raw.movimientos || [], updatedAt: raw.updatedAt || 0 };
  } catch {
    return { movimientos: [], updatedAt: 0 };
  }
}

let datos = leerLocal();

function guardarLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
}

function formatear(n) {
  return "$" + n.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function render() {
  lista.innerHTML = "";
  let ingresos = 0;
  let gastos = 0;

  for (const m of datos.movimientos) {
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
  vacio.classList.toggle("oculto", datos.movimientos.length > 0);
}

// Cualquier cambio local: marca hora, guarda, repinta y programa subida.
function mutar(fn) {
  fn();
  datos.updatedAt = Date.now();
  guardarLocal();
  render();
  programarSubida();
}

function borrar(id) {
  mutar(() => {
    datos.movimientos = datos.movimientos.filter((m) => m.id !== id);
  });
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

  mutar(() => {
    datos.movimientos.unshift({
      id: Date.now(),
      descripcion: descInput.value.trim(),
      monto,
      categoria: categoriaInput.value,
      tipo: tipoActual,
    });
  });
  form.reset();
  descInput.focus();
});

// ---- Indicador de estado de sincronización ----

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

  // En pantalla táctil no hay "title" visible: mostramos el detalle del error
  // como texto bien legible bajo la barra, y lo ocultamos cuando todo va bien.
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
      // La nube tiene lo más reciente: lo adoptamos.
      datos = { movimientos: remoto.movimientos || [], updatedAt: remotoAt };
      guardarLocal();
      render();
    } else if (!remoto || datos.updatedAt > remotoAt) {
      // Lo local es más reciente (o no había nada): lo subimos.
      await subirANube(datos);
    }
    setEstado("ok");
  } catch (e) {
    setEstado("error", e.message);
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
      setEstado("error", e.message);
    }
  }, 800);
}

async function arrancarSync() {
  if (!syncConfigurada()) {
    if (syncBar) syncBar.classList.add("oculto");
    return;
  }
  if (syncBar) syncBar.classList.remove("oculto");

  // El botón SIEMPRE responde, aunque MSAL no se haya cargado: así nunca
  // se queda "sin hacer nada" en silencio; si algo falla, lo explica.
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

render();
arrancarSync();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
