/* Código compartido por todas las páginas de VerificaPrecios.
   Frontend solamente: los datos se guardan en localStorage simulando las tablas SQL.
   Cuando exista backend, reemplaza el objeto `store` por llamadas a la API.
   Nota: las contraseñas se guardan en texto plano SOLO por ser una demo. */
'use strict';

/* ---------- Capa de datos (simula tablas) ----------
   Usuario:           { username, nombres, apellidoPaterno, apellidoMaterno, fechaNacimiento, email, puesto, password, role }
   CategoriaProducto: { IDCategoria, NombreCategoria }
   Producto:          { IDProducto, Nombre, Marca, IDCategoria (FK), PrecioUnitario, StockActual }
   Fotografías:       se guardan aparte (no forman parte de la tabla Producto), indexadas por IDProducto,
                      simulando la carpeta de imágenes del servidor. */
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
  get users() { return this.get('vp2_users', []); },
  set users(v) { this.set('vp2_users', v); },
  get categories() { return this.get('vp2_categorias', []); },
  set categories(v) { this.set('vp2_categorias', v); },
  get products() { return this.get('vp2_productos', []); },
  set products(v) { this.set('vp2_productos', v); },
  get photos() { return this.get('vp2_fotos', {}); },
  set photos(v) { this.set('vp2_fotos', v); },
  get session() { return this.get('vp2_session', null); },
  set session(v) { this.set('vp2_session', v); },
};

if (!store.users.length) {
  store.users = [{
    username: 'admin', nombres: 'Administrador', apellidoPaterno: 'Sistema', apellidoMaterno: '',
    fechaNacimiento: '1990-01-01', email: 'admin@demo.com', puesto: 'Administrador', password: 'admin123', role: 'admin',
  }];
}
if (!store.categories.length) {
  store.categories = ['Abarrotes', 'Bebidas', 'Lácteos', 'Frutas y verduras', 'Carnes y embutidos', 'Limpieza', 'Higiene personal', 'Otros']
    .map((n, i) => ({ IDCategoria: i + 1, NombreCategoria: n }));
}

/* ---------- Utilidades ---------- */
const $ = (sel) => document.querySelector(sel);
const money = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
const categoryName = (id) => store.categories.find((c) => c.IDCategoria === Number(id))?.NombreCategoria ?? 'Sin categoría';

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function setMsg(node, text, ok = false) {
  node.textContent = text;
  node.classList.toggle('ok', ok);
}

const fullName = (u) => `${u.nombres} ${u.apellidoPaterno}`.trim();
const currentUser = () => store.users.find((u) => u.username.toLowerCase() === store.session) || null;

/* ---------- Sesión y cabecera ---------- */
/** Sin sesión → login. Si se requiere admin y no lo es → menú. Devuelve el usuario o null. */
function requireAuth({ admin = false } = {}) {
  const user = currentUser();
  if (!user) { location.replace('index.html'); return null; }
  if (admin && user.role !== 'admin') { location.replace('menu.html'); return null; }
  return user;
}

/** En login/registro: si ya hay sesión, va al menú. */
function redirectIfLoggedIn() {
  if (currentUser()) { location.replace('menu.html'); return true; }
  return false;
}

/** Dibuja la barra superior. `active` es el archivo de la página actual. */
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
    el('button', { className: 'secondary', textContent: 'Salir', onclick: () => { store.session = null; location.href = 'index.html'; } }),
  ));
}

/* ---------- Fotografías ---------- */
/** Valida JPG/PNG y la reduce (máx. 480 px) para que quepa en localStorage. */
function imageToDataURL(file, max = 480) {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png'].includes(file.type)) return reject(new Error('La fotografía debe ser JPG o PNG.'));
    if (file.size > 5 * 1024 * 1024) return reject(new Error('La fotografía no debe superar 5 MB.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

/** Inserta o actualiza un producto (y su foto si se envía). Revierte si el almacenamiento está lleno. */
function upsertProduct(product, photo) {
  const prevProducts = store.products;
  const prevPhotos = store.photos;
  try {
    if (photo) store.photos = { ...prevPhotos, [product.IDProducto]: photo };
    const exists = prevProducts.some((p) => p.IDProducto === product.IDProducto);
    store.products = exists
      ? prevProducts.map((p) => (p.IDProducto === product.IDProducto ? product : p))
      : [...prevProducts, product];
  } catch {
    try { store.photos = prevPhotos; } catch { /* sin acción */ }
    throw new Error('No se pudo guardar: el almacenamiento del navegador está lleno.');
  }
}

function deleteProduct(id) {
  store.products = store.products.filter((p) => p.IDProducto !== id);
  const { [id]: _removed, ...rest } = store.photos;
  store.photos = rest;
}

/* ---------- Formulario de artículo (registro y edición) ---------- */
function field(label, name, type, value = '', attrs = {}) {
  return el('label', {}, label, el('input', { name, type, value, ...attrs }));
}

/**
 * Construye los campos del formulario de producto.
 * options: { product, edit, onCancel }
 */
function buildProductForm(form, { product = {}, edit = false, onCancel = null } = {}) {
  const select = el('select', { name: 'IDCategoria', required: true },
    el('option', { value: '', textContent: 'Selecciona una categoría', disabled: true, selected: !product.IDCategoria }),
    ...store.categories.map((c) => el('option', { value: c.IDCategoria, textContent: c.NombreCategoria, selected: c.IDCategoria === product.IDCategoria })));

  const preview = el('img', { className: 'preview', alt: 'Vista previa de la fotografía', hidden: true });
  const currentPhoto = edit ? store.photos[product.IDProducto] : null;
  if (currentPhoto) { preview.src = currentPhoto; preview.hidden = false; }

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

/** Lee el formulario → objeto Producto (sin foto). */
function readProduct(form) {
  const f = new FormData(form);
  return {
    IDProducto: f.get('IDProducto').trim(),
    Nombre: f.get('Nombre').trim(),
    Marca: f.get('Marca').trim(),
    IDCategoria: Number(f.get('IDCategoria')),
    PrecioUnitario: Math.round(parseFloat(f.get('PrecioUnitario')) * 100) / 100,
    StockActual: parseInt(f.get('StockActual'), 10),
  };
}

/** Valida valores numéricos y la FK de categoría. Devuelve mensaje de error o null. */
function validateProduct(p) {
  if (!(p.PrecioUnitario > 0)) return 'El precio debe ser mayor a 0.';
  if (!Number.isInteger(p.StockActual) || p.StockActual < 0) return 'El stock debe ser un entero mayor o igual a 0.';
  if (!store.categories.some((c) => c.IDCategoria === p.IDCategoria)) return 'Selecciona una categoría válida.';
  return null;
}

/** Devuelve la foto reducida del input file, o null si no se eligió. */
async function readPhoto(form) {
  const file = new FormData(form).get('Fotografia');
  return file && file.size ? imageToDataURL(file) : null;
}

/* ---------- Validación de formularios ----------
   Reglas declaradas con atributos HTML (required, pattern, minlength, min, max, step, title)
   más validadores propios (data-validate, data-match). Los mensajes se muestran bajo cada campo.
   Uso: setupValidation(form) una vez; validateForm(form) al enviar. */
const MIN_AGE = 16;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function ageFrom(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

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

/** Etiqueta legible del campo: texto de su <label> sin paréntesis, o su aria-label. */
function fieldLabel(input) {
  const raw = input.closest('label')?.childNodes[0]?.textContent || input.getAttribute('aria-label') || 'Este campo';
  return raw.replace(/\s*\(.*?\)\s*/g, ' ').trim();
}

/** Devuelve el mensaje de error del campo, o '' si es válido. */
function fieldError(input) {
  const v = input.validity;
  const value = input.value;
  const label = fieldLabel(input);

  if (input.type === 'file') {
    const f = input.files[0];
    if (!f) return input.required ? 'Selecciona una fotografía.' : '';
    if (!['image/jpeg', 'image/png'].includes(f.type)) return 'La fotografía debe ser JPG o PNG.';
    if (f.size > MAX_PHOTO_BYTES) return 'La fotografía no debe superar 5 MB.';
    return '';
  }
  if (v.valueMissing) return input.tagName === 'SELECT' ? 'Selecciona una opción.' : `${label} es obligatorio.`;
  if (['text', 'search'].includes(input.type) && value && !value.trim()) return 'No puede contener solo espacios.';
  if (v.badInput) return 'Escribe un valor válido.';
  if (input.type === 'email' && v.typeMismatch) return 'Escribe un correo válido (ej. nombre@dominio.com).';

  const custom = VALIDATORS[input.dataset.validate]?.(input);
  if (custom) return custom;

  if (input.dataset.match) {
    const other = input.form.elements[input.dataset.match];
    if (other && value !== other.value) return 'Las contraseñas no coinciden.';
  }
  if (v.patternMismatch) return input.title || `${label} no tiene un formato válido.`;
  if (input.minLength > 0 && value && value.length < input.minLength) return `${label} debe tener al menos ${input.minLength} caracteres.`;
  if (v.rangeUnderflow) return `El valor mínimo es ${input.min}.`;
  if (v.rangeOverflow) return `El valor máximo es ${input.max}.`;
  if (v.stepMismatch) return Number(input.step) === 1 ? 'Debe ser un número entero.' : 'Usa máximo 2 decimales.';
  return '';
}

let errorSeq = 0;
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

/** Muestra (o limpia, si msg es '') el error de un campo. */
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

function validateField(input) {
  if (input.readOnly || input.disabled) return true;
  const msg = fieldError(input);
  showFieldError(input, msg);
  return !msg;
}

/** Valida todos los campos; enfoca el primero inválido. Devuelve true si todo es válido. */
function validateForm(form) {
  let first = null;
  form.querySelectorAll('input, select').forEach((input) => {
    if (!validateField(input) && !first) first = input;
  });
  first?.focus();
  return !first;
}

/** Activa la validación en vivo (al salir del campo y al corregirlo). Es seguro llamarla varias veces. */
function setupValidation(form) {
  form.noValidate = true; // se usan mensajes propios en lugar de los del navegador
  if (form.dataset.validation) return;
  form.dataset.validation = '1';

  const isField = (t) => t.matches?.('input, select');

  form.addEventListener('focusout', (e) => {
    const t = e.target;
    if (!isField(t) || t.readOnly) return;
    if (['text', 'email', 'search'].includes(t.type)) t.value = t.value.trim();
    // No molestar con "obligatorio" a quien solo pasó por el campo.
    if (!t.value && t.type !== 'file' && t.getAttribute('aria-invalid') !== 'true') return;
    validateField(t);
  });

  const revalidate = (e) => {
    const t = e.target;
    if (!isField(t)) return;
    if (t.getAttribute('aria-invalid') === 'true' || t.tagName === 'SELECT' || t.type === 'file') validateField(t);
    // Si cambia la contraseña, vuelve a comprobar su confirmación.
    form.querySelectorAll(`[data-match="${t.name}"]`).forEach((c) => { if (c.value) validateField(c); });
  };
  form.addEventListener('input', revalidate);
  form.addEventListener('change', revalidate);
}
