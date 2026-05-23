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
