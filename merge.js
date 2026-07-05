// Fusión de datos entre dispositivos SIN depender del DOM (testable por separado).
//
// Idea: en vez de "el más reciente gana sobre todo el conjunto" (que puede borrar
// lo que hiciste en otro dispositivo), fusionamos elemento a elemento:
//   - Cada movimiento/fijo/aviso lleva una marca de tiempo `mod` (cuándo se tocó).
//   - Al fusionar dos versiones, para cada id nos quedamos con la de `mod` mayor.
//   - Los borrados se guardan como "lápidas" (id -> cuándo se borró). Un elemento
//     desaparece si su lápida es igual o más nueva que su última modificación
//     (así, si lo editas DESPUÉS de borrarlo en otro sitio, la edición gana).

function fusionarBorrados(a, b) {
  const r = { mov: {}, fijo: {}, aviso: {} };
  for (const k of ["mov", "fijo", "aviso"]) {
    const ax = (a && a[k]) || {};
    const bx = (b && b[k]) || {};
    for (const id of new Set([...Object.keys(ax), ...Object.keys(bx)])) {
      r[k][id] = Math.max(ax[id] || 0, bx[id] || 0);
    }
  }
  return r;
}

function fusionarColeccion(a, b, tomb) {
  const map = new Map();
  for (const it of a || []) map.set(String(it.id), it);
  for (const it of b || []) {
    const ex = map.get(String(it.id));
    if (!ex || (it.mod || 0) > (ex.mod || 0)) map.set(String(it.id), it);
  }
  const out = [];
  for (const it of map.values()) {
    const t = tomb[String(it.id)];
    if (t != null && t >= (it.mod || 0)) continue; // el borrado gana
    out.push(it);
  }
  return out;
}

function fusionarDatos(local, remoto) {
  const borrados = fusionarBorrados(local.borrados, remoto.borrados);
  return {
    movimientos: fusionarColeccion(local.movimientos, remoto.movimientos, borrados.mov),
    fijos: fusionarColeccion(local.fijos, remoto.fijos, borrados.fijo),
    avisos: fusionarColeccion(local.avisos, remoto.avisos, borrados.aviso),
    categorias: [...new Set([...(local.categorias || []), ...(remoto.categorias || [])])],
    borrados,
    updatedAt: Math.max(local.updatedAt || 0, remoto.updatedAt || 0),
  };
}

// En el navegador esto no hace nada (module es undefined); en Node permite probarlo.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { fusionarDatos, fusionarColeccion, fusionarBorrados };
}
