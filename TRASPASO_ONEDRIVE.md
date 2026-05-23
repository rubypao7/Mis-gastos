# TRASPASO — Sincronización con OneDrive para la app "Mis Gastos"

> Documento de traspaso para continuar el trabajo en el repositorio correcto.
> **Cópialo y pégalo entero en la nueva sesión de Claude abierta sobre el repo `Mis-gastos`.**

---

## 0. INSTRUCCIÓN PARA LA NUEVA SESIÓN (léela primero)

Estás trabajando en el repo **`rubypao7/Mis-gastos`** (rama `claude/github-workflow-example-WHYGx`),
que es el que se publica en **GitHub Pages** en `https://rubypao7.github.io/Mis-gastos/`.

En una sesión anterior, por error, todo el código de sincronización con OneDrive se
escribió en OTRO repo (`prueba-claude`) que no es el que se publica. Tu tarea es
**replicar exactamente** ese trabajo aquí, en `Mis-gastos`, para que la sincronización
funcione en el sitio que la usuaria realmente abre.

La app es una PWA (HTML/CSS/JS sin framework) de control de gastos para iPhone/iPad/Mac.
La usuaria NO es técnica: explica en español, claro y sin tecnicismos, y avisa de cualquier
limitación con honestidad.

**Qué tienes que hacer:**
1. Revisar qué tiene ahora mismo el repo `Mis-gastos` (puede tener ya una versión a medias).
2. Crear/reemplazar los archivos con el contenido EXACTO de la sección 4.
3. Validar sintaxis (`node --check`), hacer commit y push a la rama indicada.
4. Guiar a la usuaria para probar el login en su dispositivo (sección 5).
5. NO crear Pull Request salvo que la usuaria lo pida.

---

## 1. OBJETIVO Y DECISIONES YA TOMADAS

- **Objetivo:** los gastos se guardan en local (como hasta ahora) PERO se sincronizan
  automáticamente entre los 3 dispositivos a través de la nube. Al abrir la app debe
  descargar lo más reciente; al añadir/borrar debe subir. Si la sincronización falla,
  debe **indicarlo en pantalla** (no fallar en silencio).
- **Proveedor elegido: OneDrive** (Microsoft Graph + MSAL).
  - Motivo: el correo de la usuaria es **@hotmail.com** → ya es cuenta Microsoft, login más fluido.
  - Se descartó **iCloud Drive**: Apple NO ofrece API para que una app web lea/escriba en
    iCloud Drive de terceros. No es viable. (Decirlo claramente si vuelve a preguntar.)
  - Google Drive sería igual de válido técnicamente, pero se eligió OneDrive por la cuenta MS.
- **Privacidad/seguridad explicada y aceptada:** el archivo de gastos vive en una carpeta
  privada de la app dentro del propio OneDrive de la usuaria (carpeta especial `approot`).
  Solo ella accede. Login oficial OAuth, HTTPS, datos cifrados en reposo. El "client ID" es
  público y no es secreto. No se usa client secret.

---

## 2. ESTADO DEL REGISTRO EN AZURE (YA HECHO — NO REPETIR)

La usuaria ya registró la app en Azure (Microsoft Entra ID → App registrations). Datos:

- **Application (client) ID:** `c75e54d5-76c0-46cd-af59-d4c661e54616`
  (en Azure aparecía como `api://c75e54d5-76c0-46cd-af59-d4c661e54616`; el valor a usar es
  solo el GUID, sin el prefijo `api://`).
- **Tipo de cuenta:** "Personal Microsoft accounts only".
- **Plataforma:** Single-page application (SPA).
- **Redirect URIs registradas:**
  - `https://rubypao7.github.io/Mis-gastos/`
  - `https://rubypao7.github.io/Mis-gastos/index.html`
- No hay client secret ni permisos añadidos a mano (se piden en el login: `Files.ReadWrite.AppFolder`, `User.Read`).

> Como el repo correcto ES `Mis-gastos`, las redirect URIs registradas YA COINCIDEN con la
> URL real. No hace falta tocar Azure (salvo que falle el login por mismatch; ver sección 6).

---

## 3. ARQUITECTURA DE LA SINCRONIZACIÓN

- **MSAL** (librería oficial de login de Microsoft) cargada por CDN (jsdelivr, versión mayor `@3`).
- **Flujo de login:** redirect (`loginRedirect`), no popup — funciona mejor dentro de PWA.
- **Autoridad:** `https://login.microsoftonline.com/consumers` (cuentas personales).
- **Almacenamiento en la nube:** un único archivo `mis-gastos.json` en la carpeta especial
  de la app: endpoint Graph `/me/drive/special/approot:/mis-gastos.json:/content`.
- **Modelo de datos** en localStorage y en la nube: `{ movimientos: [...], updatedAt: <ms> }`.
- **Estrategia de fusión:** "el más reciente gana" comparando `updatedAt` a nivel de todo el
  conjunto (simple y predecible para una sola usuaria; conviene editar en un dispositivo a la vez).
- **Indicador de estado** (badge bajo el balance): sin-conectar / sincronizando / ok / error,
  con el detalle del error en el `title`.

---

## 4. ARCHIVOS — CONTENIDO EXACTO A CREAR/REEMPLAZAR EN `Mis-gastos`

> Crea estos archivos con EXACTAMENTE este contenido. Son 6 archivos:
> `config.js` y `sync.js` son nuevos; `index.html`, `app.js`, `styles.css`, `sw.js` se actualizan.

### 4.1 `config.js` (NUEVO)
```js
// Configuración de la sincronización con OneDrive.
// Pega aquí el "Application (client) ID" que obtendrás al registrar la app en Azure.
// Mientras diga PEGA_AQUI..., la app funciona en modo local (sin sincronizar).
const SYNC_CONFIG = {
  clientId: "c75e54d5-76c0-46cd-af59-d4c661e54616",
};
```

### 4.2 `sync.js` (NUEVO)
```js
// Sincronización con OneDrive mediante Microsoft Graph + MSAL (login oficial).
// Los gastos se guardan en una carpeta privada de la app dentro de tu OneDrive.

const GRAPH = "https://graph.microsoft.com/v1.0";
const FILE_PATH = "/me/drive/special/approot:/mis-gastos.json:/content";
const SCOPES = ["Files.ReadWrite.AppFolder", "User.Read"];

let msalApp = null;
let cuenta = null;

function syncConfigurada() {
  return (
    typeof SYNC_CONFIG !== "undefined" &&
    SYNC_CONFIG.clientId &&
    !SYNC_CONFIG.clientId.startsWith("PEGA_AQUI")
  );
}

function haySesion() {
  return Boolean(cuenta);
}

async function initSync() {
  if (!syncConfigurada() || typeof msal === "undefined") return false;

  msalApp = new msal.PublicClientApplication({
    auth: {
      clientId: SYNC_CONFIG.clientId,
      authority: "https://login.microsoftonline.com/consumers",
      redirectUri: location.origin + location.pathname,
    },
    cache: { cacheLocation: "localStorage" },
  });

  await msalApp.initialize();

  const resp = await msalApp.handleRedirectPromise().catch(() => null);
  if (resp && resp.account) {
    cuenta = resp.account;
  } else {
    const cuentas = msalApp.getAllAccounts();
    if (cuentas.length) cuenta = cuentas[0];
  }
  if (cuenta) msalApp.setActiveAccount(cuenta);
  return true;
}

async function conectarOneDrive() {
  if (!msalApp) return;
  // Redirect funciona mejor que popup dentro de una PWA instalada.
  await msalApp.loginRedirect({ scopes: SCOPES });
}

async function desconectarOneDrive() {
  if (!msalApp || !cuenta) return;
  await msalApp.logoutRedirect({ account: cuenta });
}

async function obtenerToken() {
  if (!msalApp || !cuenta) throw new Error("Sin sesión");
  try {
    const r = await msalApp.acquireTokenSilent({ scopes: SCOPES, account: cuenta });
    return r.accessToken;
  } catch (e) {
    // El token silencioso falló: pedimos login interactivo (navega y vuelve).
    await msalApp.acquireTokenRedirect({ scopes: SCOPES });
    throw new Error("Reautenticando");
  }
}

async function descargarDeNube() {
  const token = await obtenerToken();
  const res = await fetch(GRAPH + FILE_PATH, {
    headers: { Authorization: "Bearer " + token },
  });
  if (res.status === 404) return null; // aún no existe el archivo
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.json();
}

async function subirANube(data) {
  const token = await obtenerToken();
  const res = await fetch(GRAPH + FILE_PATH, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
}
```

### 4.3 `app.js` (REEMPLAZAR ENTERO)
```js
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

  const conectado = estado !== "sin-conectar";
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

  if (typeof msal === "undefined") {
    setEstado("error", "No se pudo cargar el inicio de sesión de Microsoft. Revisa tu conexión a internet y recarga la app.");
    return;
  }

  btnCuenta.addEventListener("click", async () => {
    try {
      if (btnCuenta.dataset.accion === "desconectar") {
        await desconectarOneDrive();
      } else {
        setEstado("sincronizando");
        await conectarOneDrive();
      }
    } catch (e) {
      setEstado("error", "No se pudo iniciar sesión: " + (e && e.message ? e.message : e));
    }
  });

  try {
    await initSync();
  } catch (e) {
    setEstado("error", "Fallo al iniciar la sincronización: " + (e && e.message ? e.message : e));
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
```

### 4.4 `index.html` (cambios)
Dos cambios respecto a la versión base:

**(a)** Dentro de `<header class="app-header">`, justo después del `<div class="balance-card">…</div>`,
añadir la barra de sincronización:
```html
    <div class="sync-bar oculto" id="sync-bar">
      <span class="badge badge-gray" id="sync-status">Sin conectar</span>
      <button class="cuenta-btn" id="btn-cuenta" data-accion="conectar">Conectar OneDrive</button>
    </div>
```

**(b)** Antes de `</body>`, los scripts deben quedar así (MSAL + config + sync + app):
```html
  <script src="https://cdn.jsdelivr.net/npm/@azure/msal-browser@3/dist/msal-browser.min.js"></script>
  <script src="config.js"></script>
  <script src="sync.js"></script>
  <script src="app.js"></script>
</body>
```

> Para referencia, así queda el `<header>` completo:
```html
  <header class="app-header">
    <h1>Mis Gastos</h1>
    <div class="balance-card">
      <span class="balance-label">Balance</span>
      <span class="balance-amount" id="balance">$0.00</span>
      <div class="balance-detail">
        <span class="ingreso">▲ <span id="total-ingresos">$0.00</span></span>
        <span class="gasto">▼ <span id="total-gastos">$0.00</span></span>
      </div>
    </div>
    <div class="sync-bar oculto" id="sync-bar">
      <span class="badge badge-gray" id="sync-status">Sin conectar</span>
      <button class="cuenta-btn" id="btn-cuenta" data-accion="conectar">Conectar OneDrive</button>
    </div>
  </header>
```

### 4.5 `styles.css` (añadir bloque)
Añadir este bloque JUSTO ANTES de la línea `main { max-width: 640px; ... }`:
```css
.sync-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}
.sync-bar.oculto { display: none; }

.badge {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.25);
  color: white;
}
.badge-gray { background: rgba(255, 255, 255, 0.25); }
.badge-amber { background: rgba(245, 158, 11, 0.9); }
.badge-green { background: rgba(16, 185, 129, 0.95); }
.badge-red { background: rgba(239, 68, 68, 0.95); }

.cuenta-btn {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1.5px solid rgba(255, 255, 255, 0.6);
  background: transparent;
  color: white;
  cursor: pointer;
}
.cuenta-btn:active { opacity: 0.7; }
```

### 4.6 `sw.js` (service worker — añadir config.js y sync.js + subir versión de caché)
El archivo debe quedar así (OJO: cada vez que cambies archivos cacheados, sube el número de
versión de `CACHE`, p. ej. v2 → v3, para que se sirva la versión nueva):
```js
const CACHE = "mis-gastos-v3";
const ARCHIVOS = [
  "index.html",
  "styles.css",
  "app.js",
  "config.js",
  "sync.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
```

> Si el repo `Mis-gastos` no tuviera aún algunos iconos del array, ajusta la lista de
> `ARCHIVOS` a los que realmente existan (un 404 en `addAll` rompe la instalación del SW).

---

## 5. CÓMO PROBAR (guía para la usuaria, tras subir los cambios)

1. Esperar 1-2 min a que GitHub Pages publique.
2. Abrir `https://rubypao7.github.io/Mis-gastos/` en Safari. Si ya estaba abierta, recargar
   (o abrir en pestaña nueva) para que cargue la versión nueva del service worker.
3. Bajo el balance aparece la barra con "Sin conectar" y el botón "Conectar OneDrive".
4. Pulsar "Conectar OneDrive" → inicia sesión con la cuenta @hotmail.com y acepta el permiso.
5. Al volver debe poner "Sincronizado ✓". A partir de ahí: cada cambio se sube; al abrir en
   otro dispositivo (conectándolo igual) se descarga lo más reciente.

Estados del badge: gris=sin conectar, ámbar=sincronizando, verde=ok, rojo=error
(mantener pulsado / pasar el ratón muestra el detalle del error en el `title`).

---

## 6. LO QUE FALTA / NO PROBADO / POSIBLES AJUSTES

- **El flujo de login OAuth NO se ha podido probar en un dispositivo real** (no se puede desde
  el entorno de Claude). Es lo primero a verificar con la usuaria.
- **Posibles fallos típicos y solución:**
  - Error de Microsoft con `redirect_uri` / `AADSTS...`: revisar que en Azure → Authentication
    estén EXACTAMENTE las URIs `https://rubypao7.github.io/Mis-gastos/` y `.../index.html`
    como tipo "Single-page application". Añadir la que falte. La URI que usa el código es
    `location.origin + location.pathname`.
  - Si MSAL no carga (badge rojo "No se pudo cargar el inicio de sesión"): problema de red/CDN;
    reintentar o probar otra versión del CDN de `@azure/msal-browser`.
  - Si `consumers` diera problemas con la cuenta, probar `authority` = `common` en `sync.js`
    (pero con cuenta personal `consumers` es lo correcto).
- **Fusión de datos:** es "el más reciente gana" a nivel de todo el conjunto. Si se edita en dos
  dispositivos a la vez sin sincronizar, puede perderse lo de uno. Suficiente para uso personal;
  si la usuaria lo pide, mejorar a fusión por id de movimiento.
- **Migración de datos existentes:** `leerLocal()` ya soporta el formato antiguo (array simple)
  y lo envuelve en `{movimientos, updatedAt:0}`. No se pierden los gastos ya guardados.
- **NO crear Pull Request** salvo petición expresa de la usuaria.

---

## 7. RESUMEN DE COMMITS HECHOS EN EL REPO EQUIVOCADO (`prueba-claude`)
Para referencia de qué se hizo, en orden:
1. "Añade sincronización con OneDrive (Microsoft Graph + MSAL)" — crea config.js, sync.js;
   integra en app.js, index.html, styles.css, sw.js (caché v2).
2. "Configura el client ID de OneDrive para activar la sincronización" — pone el client ID real.
3. "Hace visibles los errores de sincronización y usa un CDN de MSAL más fiable" — cambia el
   CDN a jsdelivr `@3` y añade avisos de error en pantalla (caché v3).

El estado final de esos archivos es EXACTAMENTE el de la sección 4 de este documento.
