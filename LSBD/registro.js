'use strict';

// Lógica de la pantalla de registro de nuevos usuarios (registro.html)
(async () => {
  if (await redirectIfLoggedIn()) return;
  renderHeader('registro.html');
  addPasswordToggles();

  const form = $('#form-signup');
  setupValidation(form);
  // Limita la fecha máxima de nacimiento al día de hoy
  $('#fecha').max = new Date().toISOString().slice(0, 10);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#msg');
    setMsg(msg, '');
    if (!validateForm(form)) return;

    try {
      // Envía todos los campos del formulario a registro.php (que ejecuta sp_RegistrarUsuario)
      await apiFetch('registro.php', { method: 'POST', body: new FormData(form) });
      location.href = 'menu.html';
    } catch (err) {
      // Muestra errores del servidor (ej. usuario o correo duplicado)
      setMsg(msg, err.message);
    }
  });
})();
