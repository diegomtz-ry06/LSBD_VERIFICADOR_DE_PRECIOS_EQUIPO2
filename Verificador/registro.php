<?php
declare(strict_types=1);
require_once 'conexion.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    responder(['ok' => false, 'error' => 'Método no permitido.'], 405);
}
verificarCsrf();

$username  = trim($_POST['username'] ?? '');
$nombres   = trim($_POST['nombres'] ?? '');
$apPaterno = trim($_POST['apellidoPaterno'] ?? '');
$apMaterno = trim($_POST['apellidoMaterno'] ?? '');
$fechaNac  = trim($_POST['fechaNacimiento'] ?? '');
$email     = strtolower(trim($_POST['email'] ?? ''));
$puesto    = trim($_POST['puesto'] ?? '');
$password  = $_POST['password'] ?? '';

// Validaciones en servidor (no confiar solo en HTML/JS)
if (!preg_match('/^[A-Za-z0-9_.]{3,20}$/', $username)) {
    responder(['ok' => false, 'error' => 'El nombre de usuario debe tener entre 3 y 20 caracteres válidos.'], 400);
}
$regexNombre = '/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\' \-]{2,60}$/u';
if (!preg_match($regexNombre, $nombres) || !preg_match($regexNombre, $apPaterno) || !preg_match($regexNombre, $apMaterno)) {
    responder(['ok' => false, 'error' => 'Verifica el formato de tu nombre y apellidos.'], 400);
}
if (mb_strlen($apPaterno) > 40 || mb_strlen($apMaterno) > 40) {
    responder(['ok' => false, 'error' => 'Los apellidos no deben superar 40 caracteres.'], 400);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 100) {
    responder(['ok' => false, 'error' => 'Escribe un correo electrónico válido.'], 400);
}
if (!preg_match('/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .,\-]{2,50}$/u', $puesto)) {
    responder(['ok' => false, 'error' => 'El puesto de trabajo debe tener entre 2 y 50 caracteres válidos.'], 400);
}
if (!preg_match('/^(?=.*[A-Za-z])(?=.*[0-9]).{8,64}$/', $password)) {
    responder(['ok' => false, 'error' => 'La contraseña debe tener entre 8 y 64 caracteres, con al menos una letra y un número.'], 400);
}

$dt = DateTime::createFromFormat('Y-m-d', $fechaNac);
if (!$dt || $dt->format('Y-m-d') !== $fechaNac) {
    responder(['ok' => false, 'error' => 'Fecha de nacimiento inválida.'], 400);
}
$hoy  = new DateTime('today');
$edad = $dt->diff($hoy)->y;
if ($dt > $hoy || $edad < 16 || $edad > 100) {
    responder(['ok' => false, 'error' => 'Debes tener entre 16 y 100 años para registrarte.'], 400);
}

$sql    = '{CALL sp_RegistrarUsuario(?, ?, ?, ?, ?, ?, ?, ?)}';
$params = [$username, $nombres, $apPaterno, $apMaterno, $fechaNac, $email, $puesto, $password];
$stmt   = sqlsrv_query($conn, $sql, $params);

if ($stmt === false) {
    $errors = sqlsrv_errors();
    if ($errors && in_array((int)$errors[0]['code'], [2627, 2601], true)) {
        responder(['ok' => false, 'error' => 'El nombre de usuario o el correo ya están registrados.'], 409);
    }
    error_log('Error en sp_RegistrarUsuario: ' . print_r($errors, true));
    responder(['ok' => false, 'error' => 'No se pudo registrar el usuario.'], 500);
}

$rowId     = sqlsrv_fetch_array($stmt, SQLSRV_FETCH_ASSOC);
$idUsuario = isset($rowId['IDUsuario']) ? (int)$rowId['IDUsuario'] : 0;

// Regenerar sesión; todo autoregistro nace estrictamente como 'user'
session_regenerate_id(true);
$_SESSION['csrf_token'] = bin2hex(random_bytes(32));

$_SESSION['user'] = [
    'id'              => $idUsuario,
    'username'        => $username,
    'nombres'         => $nombres,
    'apellidoPaterno' => $apPaterno,
    'puesto'          => $puesto,
    'role'            => 'user',
];

responder([
    'ok'        => true,
    'user'      => $_SESSION['user'],
    'csrfToken' => $_SESSION['csrf_token'],
], 201);