'use strict';

if (!redirectIfLoggedIn()) {
  renderHeader('index.html');

  const form = $('#form-login');
  setupValidation(form);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    setMsg($('#msg'), '');
    if (!validateForm(form)) return;
    const f = new FormData(e.target);
    const username = f.get('username').trim().toLowerCase();
    const user = store.users.find((u) => u.username.toLowerCase() === username && u.password === f.get('password'));
    if (!user) return setMsg($('#msg'), 'Usuario o contraseña incorrectos.');
    store.session = username;
    location.href = 'menu.html';
  });
}
