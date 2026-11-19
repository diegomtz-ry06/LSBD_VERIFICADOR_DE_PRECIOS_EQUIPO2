'use strict';

// Lógica del menú principal post-inicio de sesión (menu.html)
(async () => {
  // Verifica la sesión activa en PHP antes de mostrar el menú
  const user = await requireAuth();
  if (!user) return;

  renderHeader('menu.html');
  // Muestra el saludo personalizado con el nombre y puesto traídos de SQL Server
  $('#greeting').textContent = `Bienvenido(a), ${fullName(user)} · ${user.puesto}`;
  // Solo muestra la tarjeta del Módulo de Administrador si el usuario tiene rol 'admin'
  $('#opt-admin').hidden = user.role !== 'admin';
})();
