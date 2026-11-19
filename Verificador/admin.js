'use strict';

// Lógica del módulo de administrador: listar, editar y eliminar productos (admin.html)
(async () => {
  // Restringe el acceso exclusivamente a usuarios con rol 'admin'
  if (!(await requireAuth({ admin: true }))) return;
  renderHeader('admin.html');
  await loadCategories();

  const dialog = $('#edit-dialog');
  const form = $('#form-edit');
  let products = [];

  /** Obtiene todos los productos desde productos.php y dibuja la tabla */
  async function renderAdmin() {
    try {
      const data = await apiFetch('productos.php?accion=listar');
      products = data.productos || [];
    } catch (err) {
      return setMsg($('#msg'), err.message);
    }

    $('#admin-empty').hidden = products.length > 0;
    $('#admin-body').replaceChildren(...products.map((p) => el('tr', {},
      el('td', {}, p.Foto
        ? el('img', { className: 'thumb', src: `${p.Foto}?t=${Date.now()}`, alt: `Foto de ${p.Nombre}` })
        : el('span', { className: 'hint', textContent: '—' })),
      el('td', { textContent: p.IDProducto }),
      el('td', { textContent: p.Nombre }),
      el('td', { textContent: p.Marca }),
      el('td', { textContent: p.NombreCategoria }),
      el('td', { textContent: money(p.PrecioUnitario) }),
      el('td', { textContent: String(p.StockActual) }),
      el('td', { className: 'actions' },
        el('button', { textContent: 'Editar', onclick: () => openEdit(p.IDProducto) }),
        el('button', { className: 'danger', textContent: 'Eliminar', onclick: () => remove(p) }),
      ),
    )));
  }

  /** Abre el modal con los datos actuales del producto seleccionado */
  function openEdit(id) {
    const product = products.find((x) => x.IDProducto === id);
    if (!product) return;
    setMsg($('#edit-msg'), '');
    buildProductForm(form, { product, edit: true, onCancel: () => dialog.close() });
    dialog.showModal();
  }

  /** Envía los cambios del modal a productos.php con accion=editar */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm(form)) return;
    const msg = $('#edit-msg');
    const fd = new FormData(form);
    fd.append('accion', 'editar');

    try {
      await apiFetch('productos.php', { method: 'POST', body: fd });
      dialog.close();
      setMsg($('#msg'), `Artículo "${fd.get('Nombre')}" actualizado.`, true);
      renderAdmin(); // Refresca la tabla con los valores nuevos
    } catch (err) {
      setMsg(msg, err.message);
    }
  });

  /** Pide confirmación y solicita a productos.php eliminar el registro y su foto */
  async function remove(p) {
    if (!confirm(`¿Eliminar "${p.Nombre}" (${p.IDProducto})?`)) return;
    const fd = new FormData();
    fd.append('accion', 'eliminar');
    fd.append('IDProducto', p.IDProducto);

    try {
      await apiFetch('productos.php', { method: 'POST', body: fd });
      setMsg($('#msg'), `Artículo "${p.Nombre}" eliminado.`, true);
      renderAdmin();
    } catch (err) {
      setMsg($('#msg'), err.message);
    }
  }

  // Carga inicial de la tabla al abrir la página
  renderAdmin();
})();