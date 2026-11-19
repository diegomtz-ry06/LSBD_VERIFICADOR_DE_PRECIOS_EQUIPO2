'use strict';

if (requireAuth()) {
  renderHeader('registrar-articulo.html');
  const form = $('#form-product');
  buildProductForm(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#msg');
    setMsg(msg, '');
    if (!validateForm(form)) return;

    const product = readProduct(form);
    const error = validateProduct(product);
    if (error) return setMsg(msg, error);

    if (store.products.some((p) => p.IDProducto === product.IDProducto)) {
      showFieldError(form.elements.IDProducto, 'Ya existe un artículo con ese código de barras.');
      return form.elements.IDProducto.focus();
    }

    try {
      const photo = await readPhoto(form);
      upsertProduct(product, photo);
    } catch (err) {
      return setMsg(msg, err.message);
    }

    buildProductForm(form);
    setMsg(msg, 'Artículo registrado correctamente.', true);
  });
}
