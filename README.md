# Mis Gastos — App de control de gastos (PWA)

App web instalable para llevar el control de tus ingresos y gastos. Funciona
en el iPad (y cualquier móvil/navegador), guarda los datos en el propio
dispositivo y funciona sin conexión a internet una vez instalada.

## Características

- Registrar **gastos** e **ingresos** con descripción, monto y categoría.
- **Balance** automático: total de ingresos, gastos y saldo.
- Los datos se guardan en el dispositivo (`localStorage`); no se pierden al cerrar.
- **Funciona offline** (Service Worker) y se **instala** como app en la pantalla de inicio.

## Cómo instalarla en tu iPad

1. Publica esta carpeta como sitio web (por ejemplo con **GitHub Pages**:
   en GitHub → *Settings* → *Pages* → elige la rama y guarda).
2. Abre la URL en **Safari** en tu iPad.
3. Toca el botón de **Compartir** → **Añadir a pantalla de inicio**.
4. ¡Listo! Tendrás el ícono de "Mis Gastos" como una app nativa.

## Probarla en tu computadora (opcional)

```bash
python3 -m http.server 8000
# luego abre http://localhost:8000
```

## Archivos

- `index.html` — estructura de la app.
- `styles.css` — diseño (optimizado para móvil/iPad).
- `app.js` — lógica (añadir, borrar, calcular balance, guardar).
- `manifest.json` — configuración de la PWA (nombre, íconos, colores).
- `sw.js` — Service Worker para que funcione sin conexión.
- `icons/` — íconos de la app.

---

> También se incluye `calculadora.py`, un primer ejemplo de prueba con Python.
