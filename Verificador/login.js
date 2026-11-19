'use strict';

// Lógica de la pantalla de inicio de sesión (index.html)
(async () => {
  // Si ya hay sesión activa en PHP, redirige al menú principal
  if (await redirectIfLoggedIn()) return;
  renderHeader('index.html');

  const form = $('#form-login');
  setupValidation(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#msg');
    setMsg(msg, '');
    if (!validateForm(form)) return;

    try {
      // Envía usuario y contraseña por POST a login.php (que ejecuta sp_ValidarLogin)
      await apiFetch('login.php', { method: 'POST', body: new FormData(form) });
      location.href = 'menu.html';
    } catch (err) {
      // Muestra el error devuelto por el servidor (ej. credenciales incorrectas)
      setMsg(msg, err.message);
    }
  });
})();
