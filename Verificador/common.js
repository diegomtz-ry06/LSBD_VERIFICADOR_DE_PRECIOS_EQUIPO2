'use strict';

// =========================================================================
// ESTADO GLOBAL EN MEMORIA Y COMUNICACIÓN CON PHP / SQL SERVER
// =========================================================================
const appState = {
  user: null,
  categories: [],
  csrfToken: '',
};

async function apiFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (method !== 'GET' && appState.csrfToken) {
    headers['X-CSRF-Token'] = appState.csrfToken;
  }
  const res = await fetch(url, { credentials: 'same-origin', ...options, headers });
  const data = await res.json().catch(() => ({ ok: false, error: 'Respuesta inválida del servidor.' }));
  if (data.csrfToken) appState.csrfToken = data.csrfToken;
  if (!res.ok || !data.ok) throw new Error(data.error || 'Error en el servidor.');
  return data;
}

async function loadSession() {
  try {
    const data = await apiFetch('sesion.php');
    appState.user = data.user;
  } catch {
    appState.user = null;
  }
  return appState.user;
}

/** Descarga las categorías desde productos.php una sola vez y las guarda en memoria */
async function loadCategories() {
  if (appState.categories.length) return appState.categories;
  const data = await apiFetch('productos.php?accion=categorias');
  appState.categories = data.categorias || [];
  return appState.categories;
}

// =========================================================================
// UTILIDADES DE INTERFAZ Y CONTROL DE SESIÓN
// =========================================================================
const $ = (sel) => document.querySelector(sel);
const money = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
const categoryName = (id) => appState.categories.find((c) => Number(c.IDCategoria) === Number(id))?.NombreCategoria ?? 'Sin categoría';
const fullName = (u) => `${u.nombres} ${u.apellidoPaterno}`.trim();
const currentUser = () => appState.user;
function addPasswordToggles() {} // Reservado para compatibilidad con registro.js

/** Crea elementos HTML dinámicamente con sus propiedades y elementos hijos */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

/** Muestra mensajes de error (rojo) o éxito (verde si ok = true) en pantalla */
function setMsg(node, text, ok = false) {
  node.textContent = text;
  node.classList.toggle('ok', ok);
}

/** Protege páginas privadas: sin sesión redirige al login; si requiere admin y no lo es, al menú */
async function requireAuth({ admin = false } = {}) {
  const user = await loadSession();
  if (!user) { location.replace('index.html'); return null; }
  if (admin && user.role !== 'admin') { location.replace('menu.html'); return null; }
  return user;
}

/** Usado en login y registro: si el usuario ya tiene sesión activa, lo manda directo al menú */
async function redirectIfLoggedIn() {
  const user = await loadSession();
  if (user) { location.replace('menu.html'); return true; }
  return false;
}

/** Dibuja la barra de navegación superior según el rol del usuario y el botón Salir */
function renderHeader(active) {
  const user = currentUser();
  const header = $('#topbar');
  header.className = 'topbar';
  header.replaceChildren(el('a', { href: user ? 'menu.html' : 'index.html', className: 'brand' },
    el('img', { src: 'favicon.svg', alt: '', width: 28, height: 28 }), 'VerificaPrecios'));
  if (!user) return;

  const link = (href, text) => {
    const a = el('a', { href, textContent: text, className: href === active ? 'active' : '' });
    if (href === active) a.setAttribute('aria-current', 'page');
    return a;
  };
  header.append(el('nav', {},
    link('menu.html', 'Inicio'),
    link('registrar-articulo.html', 'Registrar artículo'),
    link('consultar.html', 'Consultar precio'),
    ...(user.role === 'admin' ? [link('admin.html', 'Administrador')] : []),
    el('span', { className: 'user-label', textContent: fullName(user) }),
    el('button', {
      className: 'secondary',
      textContent: 'Salir',
      onclick: async () => {
        await apiFetch('logout.php', { method: 'POST' }).catch(() => {});
        location.href = 'index.html';
      },
    }),
  ));
}

// =========================================================================
// FORMULARIO DE ARTÍCULOS (ALTA Y EDICIÓN)
// =========================================================================

/** Crea un par <label> + <input> para reutilizarlo en los formularios */
function field(label, name, type, value = '', attrs = {}) {
  return el('label', {}, label, el('input', { name, type, value, ...attrs }));
}

/** Construye los campos del producto, carga el <select> de categorías y previsualiza la foto */
function buildProductForm(form, { product = {}, edit = false, onCancel = null } = {}) {
  const select = el('select', { name: 'IDCategoria', required: true },
    el('option', { value: '', textContent: 'Selecciona una categoría', disabled: true, selected: !product.IDCategoria }),
    ...appState.categories.map((c) => el('option', {
      value: c.IDCategoria,
      textContent: c.NombreCategoria,
      selected: Number(c.IDCategoria) === Number(product.IDCategoria),
    })));

  const preview = el('img', { className: 'preview', alt: 'Vista previa de la fotografía', hidden: true });
  // En modo edición muestra la foto actual (agrega ?t=Date.now() para evitar caché)
  if (edit && product.Foto) { preview.src = `${product.Foto}?t=${Date.now()}`; preview.hidden = false; }

  const fileInput = el('input', { type: 'file', name: 'Fotografia', accept: 'image/jpeg,image/png', required: !edit });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (!f) return;
    preview.src = URL.createObjectURL(f);
    preview.hidden = false;
  });

  form.className = 'form-grid';
  setupValidation(form);
  form.replaceChildren(
    field('IDProducto (código de barras)', 'IDProducto', 'text', product.IDProducto ?? '', {
      required: true, pattern: '[0-9]{8,14}', title: 'Debe tener entre 8 y 14 dígitos numéricos.', inputMode: 'numeric', readOnly: edit, maxLength: 14,
    }),
    field('Nombre del producto', 'Nombre', 'text', product.Nombre ?? '', { required: true, minLength: 2, maxLength: 80 }),
    field('Marca del producto', 'Marca', 'text', product.Marca ?? '', { required: true, minLength: 2, maxLength: 60 }),
    el('label', {}, 'Categoría del producto', select),
    field('Precio unitario (MXN)', 'PrecioUnitario', 'number', product.PrecioUnitario ?? '', { required: true, min: '0.01', max: '999999.99', step: '0.01', inputMode: 'decimal' }),
    field('Stock actual', 'StockActual', 'number', product.StockActual ?? '', { required: true, min: '0', max: '1000000', step: '1', inputMode: 'numeric' }),
    el('label', { className: 'full' }, edit ? 'Fotografía (JPG/PNG, opcional para reemplazarla)' : 'Fotografía (JPG/PNG)', fileInput, preview),
    el('div', { className: 'row full' },
      ...(onCancel ? [el('button', { type: 'button', className: 'secondary', textContent: 'Cancelar', onclick: onCancel })] : []),
      el('button', { type: 'submit', textContent: edit ? 'Guardar cambios' : 'Registrar artículo' })),
  );
}

// =========================================================================
// VALIDACIÓN DE FORMULARIOS EN CLIENTE
// =========================================================================
const MIN_AGE = 16; // Edad mínima permitida para registrarse
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // Peso máximo de fotografía: 5 MB

/** Calcula la edad en años a partir de una fecha YYYY-MM-DD */
function ageFrom(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

/** Validadores personalizados referenciados mediante data-validate en HTML */
const VALIDATORS = {
  birthdate(input) {
    if (!input.value) return '';
    if (input.value > new Date().toISOString().slice(0, 10)) return 'La fecha de nacimiento no puede ser futura.';
    const age = ageFrom(input.value);
    if (age > 100) return 'Escribe una fecha de nacimiento válida.';
    if (age < MIN_AGE) return `Debes tener al menos ${MIN_AGE} años para registrarte.`;
    return '';
  },
};

/** Extrae el texto limpio de la etiqueta <label> de un campo para mostrar mensajes claros */
function fieldLabel(input) {
  const raw = input.closest('label')?.childNodes[0]?.textContent || input.getAttribute('aria-label') || 'Este campo';
  return raw.replace(/\s*\(.*?\)\s*/g, ' ').trim();
}

/** Evalúa las reglas de un campo y devuelve el texto de error (o '' si es válido) */
function fieldError(input) {
  const v = input.validity;
  const value = input.value;
  const label = fieldLabel(input);

  // Validación de archivo de imagen (tipo JPG/PNG y peso máximo)
  if (input.type === 'file') {
    const f = input.files[0];
    if (!f) return input.required ? 'Selecciona una fotografía.' : '';
    if (!['image/jpeg', 'image/png'].includes(f.type)) return 'La fotografía debe ser JPG o PNG.';
    if (f.size > MAX_PHOTO_BYTES) return 'La fotografía no debe superar 5 MB.';
    return '';
  }

  // Validaciones estándar HTML5
  if (v.valueMissing) return input.tagName === 'SELECT' ? 'Selecciona una opción.' : `${label} es obligatorio.`;
  if (['text', 'search'].includes(input.type) && value && !value.trim()) return 'No puede contener solo espacios.';
  if (v.badInput) return 'Escribe un valor válido.';
  if (input.type === 'email' && v.typeMismatch) return 'Escribe un correo válido (ej. nombre@dominio.com).';

  // Validadores personalizados (fecha de nacimiento)
  const custom = VALIDATORS[input.dataset.validate]?.(input);
  if (custom) return custom;

  // Compara con otro campo (confirmación de contraseña)
  if (input.dataset.match) {
    const other = input.form.elements[input.dataset.match];
    if (other && value !== other.value) return 'Las contraseñas no coinciden.';
  }

  // Validaciones de formato, longitud y rangos numéricos
  if (v.patternMismatch) return input.title || `${label} no tiene un formato válido.`;
  if (input.minLength > 0 && value && value.length < input.minLength) return `${label} debe tener al menos ${input.minLength} caracteres.`;
  if (v.rangeUnderflow) return `El valor mínimo es ${input.min}.`;
  if (v.rangeOverflow) return `El valor máximo es ${input.max}.`;
  if (v.stepMismatch) return Number(input.step) === 1 ? 'Debe ser un número entero.' : 'Usa máximo 2 decimales.';
  return '';
}

let errorSeq = 0;

/** Obtiene o crea la etiqueta <small class="field-error"> debajo del campo */
function errorElement(input) {
  if (input.dataset.errorTarget) return $(input.dataset.errorTarget);
  const holder = input.closest('label') || input.parentElement;
  let node = holder.querySelector(':scope > .field-error');
  if (!node) {
    node = el('small', { className: 'field-error', id: `field-error-${++errorSeq}` });
    node.setAttribute('aria-live', 'polite');
    holder.append(node);
  }
  return node;
}

/** Muestra o limpia el mensaje de error de un campo y actualiza atributos de accesibilidad */
function showFieldError(input, msg) {
  const node = errorElement(input);
  node.textContent = msg;
  if (msg) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', node.id);
  } else {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }
}
const clearFieldError = (input) => showFieldError(input, '');

/** Valida un campo individual y devuelve true si es válido */
function validateField(input) {
  if (input.readOnly || input.disabled) return true;
  const msg = fieldError(input);
  showFieldError(input, msg);
  return !msg;
}

/** Valida todo el formulario y enfoca el primer campo con error */
function validateForm(form) {
  let first = null;
  form.querySelectorAll('input, select').forEach((input) => {
    if (!validateField(input) && !first) first = input;
  });
  first?.focus();
  return !first;
}

/** Activa la validación en vivo al salir de cada campo y al corregir errores */
function setupValidation(form) {
  form.noValidate = true; // Usa mensajes propios en lugar de los globos del navegador
  if (form.dataset.validation) return;
  form.dataset.validation = '1';

  const isField = (t) => t.matches?.('input, select');

  form.addEventListener('focusout', (e) => {
    const t = e.target;
    if (!isField(t) || t.readOnly) return;
    if (['text', 'email', 'search'].includes(t.type)) t.value = t.value.trim();
    if (!t.value && t.type !== 'file' && t.getAttribute('aria-invalid') !== 'true') return;
    validateField(t);
  });

  const revalidate = (e) => {
    const t = e.target;
    if (!isField(t)) return;
    if (t.getAttribute('aria-invalid') === 'true' || t.tagName === 'SELECT' || t.type === 'file') validateField(t);
    form.querySelectorAll(`[data-match="${t.name}"]`).forEach((c) => { if (c.value) validateField(c); });
  };
  form.addEventListener('input', revalidate);
  form.addEventListener('change', revalidate);
}