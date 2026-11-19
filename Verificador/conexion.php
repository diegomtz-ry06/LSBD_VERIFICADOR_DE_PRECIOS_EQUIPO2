<?php
declare(strict_types=1);

// Cabeceras de seguridad para la API
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-store, no-cache, must-revalidate');

// Configuración segura de la sesión antes de iniciarla
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    $esHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => $esHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

sqlsrv_configure('WarningsReturnAsErrors', 0);

// Ajusta $serverName según tu instancia local (ej. 'localhost\SQLEXPRESS' o '.')
// Usar 'localhost' o '.' apunta a tu instancia predeterminada (D-VIVOBOOK-IRIS)
// y mantiene el código portable para cuando lo pases a la VM
$serverName = 'localhost';
$connectionOptions = [
    'Database'               => 'VerificadorPreciosDB',
    'Uid'                    => 'user_basico',
    'PWD'                    => 'u53r_b4s1c0',
    'CharacterSet'           => 'UTF-8',
    'Encrypt'                => true,
    'TrustServerCertificate' => true,
];

$conn = sqlsrv_connect($serverName, $connectionOptions);

if ($conn === false) {
    error_log('Error de conexión SQL Server: ' . print_r(sqlsrv_errors(), true));
    http_response_code(500);
    echo json_encode([
        'ok'    => false,
        'error' => 'No se pudo conectar con la base de datos.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function responder(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function obtenerCsrfToken(): string {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function verificarCsrf(): void {
    $tokenRecibido = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $tokenValido   = $_SESSION['csrf_token'] ?? '';
    if ($tokenValido === '' || !hash_equals($tokenValido, $tokenRecibido)) {
        responder(['ok' => false, 'error' => 'Token de seguridad inválido. Recarga la página.'], 403);
    }
}