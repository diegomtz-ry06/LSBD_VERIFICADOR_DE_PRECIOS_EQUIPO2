'use strict';

if (requireAuth({ admin: true })) {
  renderHeader('admin.html');

  const dialog = $('#edit-dialog');
  const form = $('#form-edit');

  function renderAdmin() {
    const products = store.products;
    const photos = store.photos;
    $('#admin-empty').hidden = products.length > 0;
    $('#admin-body').replaceChildren(...products.map((p) => el('tr', {},
      el('td', {}, photos[p.IDProducto]
        ? el('img', { className: 'thumb', src: photos[p.IDProducto], alt: `Foto de ${p.Nombre}` })
        : el('span', { className: 'hint', textContent: '—' })),
      el('td', { textContent: p.IDProducto }),
      el('td', { textContent: p.Nombre }),
      el('td', { textContent: p.Marca }),
      el('td', { textContent: categoryName(p.IDCategoria) }),
      el('td', { textContent: money(p.PrecioUnitario) }),
      el('td', { textContent: String(p.StockActual) }),
      el('td', { className: 'actions' },
        el('button', { textContent: 'Editar', onclick: () => openEdit(p.IDProducto) }),
        el('button', { className: 'danger', textContent: 'Eliminar', onclick: () => remove(p) }),
      ),
    )));
  }

  function openEdit(id) {
    const product = store.products.find((x) => x.IDProducto === id);
    if (!product) return;
    setMsg($('#edit-msg'), '');
    buildProductForm(form, { product, edit: true, onCancel: () => dialog.close() });
    dialog.showModal();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm(form)) return;
    const msg = $('#edit-msg');
    const product = readProduct(form);
    const error = validateProduct(product);
    if (error) return setMsg(msg, error);

    try {
      const photo = await readPhoto(form); // null = conservar la foto actual
      upsertProduct(product, photo);
    } catch (err) {
      return setMsg(msg, err.message);
    }
    dialog.close();
    setMsg($('#msg'), `Artículo "${product.Nombre}" actualizado.`, true);
    renderAdmin();
  });

  function remove(p) {
    if (!confirm(`¿Eliminar "${p.Nombre}" (${p.IDProducto})?`)) return;
    deleteProduct(p.IDProducto);
    setMsg($('#msg'), `Artículo "${p.Nombre}" eliminado.`, true);
    renderAdmin();
  }

  renderAdmin();
}
