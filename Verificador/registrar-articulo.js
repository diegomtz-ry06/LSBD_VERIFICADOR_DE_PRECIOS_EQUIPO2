'use strict';

// Lógica para dar de alta un producto nuevo (registrar-articulo.html)
(async () => {
  if (!(await requireAuth())) return;
  renderHeader('registrar-articulo.html');

  // Carga las categorías desde CategoriaProducto antes de construir el formulario
  await loadCategories();

  const form = $('#form-product');
  buildProductForm(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#msg');
    setMsg(msg, '');
    if (!validateForm(form)) return;

    // FormData empaqueta automáticamente los textos y el archivo de imagen (Fotografia)
    const fd = new FormData(form);
    fd.append('accion', 'crear');

    try {
      // Envía los datos e imagen a productos.php para guardarlos en BD y en uploads/
      await apiFetch('productos.php', { method: 'POST', body: fd });
      buildProductForm(form); // Limpia el formulario tras guardar
      setMsg(msg, 'Artículo registrado correctamente.', true);
    } catch (err) {
      setMsg(msg, err.message);
    }
  });
})();
