'use strict';

const user = requireAuth();
if (user) {
  renderHeader('menu.html');
  $('#greeting').textContent = `Bienvenido(a), ${fullName(user)} · ${user.puesto}`;
  $('#opt-admin').hidden = user.role !== 'admin';
}
