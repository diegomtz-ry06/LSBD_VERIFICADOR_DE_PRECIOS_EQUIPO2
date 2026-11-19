<?php
declare(strict_types=1);
require_once 'conexion.php';

responder([
    'ok'        => true,
    'user'      => $_SESSION['user'] ?? null,
    'csrfToken' => obtenerCsrfToken(),
]);