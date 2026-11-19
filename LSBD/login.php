<?php
declare(strict_types=1);
require_once 'conexion.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    responder(['ok' => false, 'error' => 'Método no permitido.'], 405);
}
verificarCsrf();

// Protección básica contra fuerza bruta por sesión
$bloqueoHasta = $_SESSION['login_lock_until'] ?? 0;
if (time() < $bloqueoHasta) {
    $restante = $bloqueoHasta - time();
    responder(['ok' => false, 'error' => "Demasiados intentos fallidos. Espera {$restante} segundos."], 429);
}

$username = trim($_POST['username'] ?? '');
$password = $_POST['password'] ?? '';

if ($username === '' || $password === '' || strlen($username) > 50 || strlen($password) > 100) {
    responder(['ok' => false, 'error' => 'Completa usuario y contraseña.'], 400);
}

$sql  = '{CALL sp_ValidarLogin(?, ?)}';
$stmt = sqlsrv_query($conn, $sql, [$username, $password]);

if ($stmt === false) {
    error_log('Error en sp_ValidarLogin: ' . print_r(sqlsrv_errors(), true));
    responder(['ok' => false, 'error' => 'Error al validar credenciales.'], 500);
}

$row = sqlsrv_fetch_array($stmt, SQLSRV_FETCH_ASSOC);

if (!$row) {
    $_SESSION['login_attempts'] = ($_SESSION['login_attempts'] ?? 0) + 1;
    if ($_SESSION['login_attempts'] >= 5) {
        $_SESSION['login_lock_until'] = time() + 30;
        $_SESSION['login_attempts']   = 0;
    }
    responder(['ok' => false, 'error' => 'Usuario o contraseña incorrectos.'], 401);
}

// Login exitoso: limpiar intentos, regenerar ID de sesión y rotar token CSRF
unset($_SESSION['login_attempts'], $_SESSION['login_lock_until']);
session_regenerate_id(true);
$_SESSION['csrf_token'] = bin2hex(random_bytes(32));

$_SESSION['user'] = [
    'id'              => (int)$row['IDUsuario'],
    'username'        => $row['NombreUsuario'],
    'nombres'         => $row['Nombres'],
    'apellidoPaterno' => $row['ApellidoPaterno'],
    'puesto'          => $row['PuestoTrabajo'],
    'role'            => ($row['Rol'] === 'Administrador') ? 'admin' : 'user',
];

responder([
    'ok'        => true,
    'user'      => $_SESSION['user'],
    'csrfToken' => $_SESSION['csrf_token'],
]);