'use strict';

if (!redirectIfLoggedIn()) {
  renderHeader('registro.html');
  addPasswordToggles();

  const form = $('#form-signup');
  setupValidation(form);
  $('#fecha').max = new Date().toISOString().slice(0, 10);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    setMsg($('#msg'), '');
    if (!validateForm(form)) return;

    const f = new FormData(form);
    const username = f.get('username').trim();
    const email = f.get('email').trim().toLowerCase();

    // Unicidad (en producción la garantiza la base de datos con UNIQUE).
    if (store.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      showFieldError(form.elements.username, 'Ese nombre de usuario ya existe.');
      return form.elements.username.focus();
    }
    if (store.users.some((u) => u.email.toLowerCase() === email)) {
      showFieldError(form.elements.email, 'Ese correo ya está registrado.');
      return form.elements.email.focus();
    }

    const user = {
      username,
      nombres: f.get('nombres').trim(),
      apellidoPaterno: f.get('apellidoPaterno').trim(),
      apellidoMaterno: f.get('apellidoMaterno').trim(),
      fechaNacimiento: f.get('fechaNacimiento'),
      email,
      puesto: f.get('puesto').trim(),
      password: f.get('password'),
      role: 'user',
    };
    try {
      store.users = [...store.users, user];
    } catch {
      return setMsg($('#msg'), 'No se pudo guardar: el almacenamiento del navegador está lleno.');
    }
    store.session = username.toLowerCase();
    location.href = 'menu.html';
  });
}
