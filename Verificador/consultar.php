<?php
declare(strict_types=1);
require_once 'conexion.php';

if (!isset($_SESSION['user'])) {
    responder(['ok' => false, 'error' => 'Debes iniciar sesión.'], 401);
}

$id = trim($_GET['id'] ?? '');
if (!preg_match('/^\d{8,14}$/', $id)) {
    responder(['ok' => false, 'error' => 'El código de barras debe tener entre 8 y 14 dígitos numéricos.'], 400);
}

$sql = "SELECT p.IDProducto, p.NombreProducto AS Nombre, p.MarcaProducto AS Marca,
               p.IDCategoria, c.NombreCategoria, p.PrecioUnitario, p.StockActual
        FROM Productos p
        INNER JOIN CategoriaProducto c ON p.IDCategoria = c.IDCategoria
        WHERE p.IDProducto = ?";
$stmt = sqlsrv_query($conn, $sql, [$id]);

if ($stmt === false) {
    error_log('Error al consultar producto: ' . print_r(sqlsrv_errors(), true));
    responder(['ok' => false, 'error' => 'Error al consultar el producto.'], 500);
}

$row = sqlsrv_fetch_array($stmt, SQLSRV_FETCH_ASSOC);
if (!$row) {
    responder(['ok' => false, 'error' => 'No se encontró ningún artículo con ese código de barras.'], 404);
}

// Registrar la consulta en tblog_verificador sin silenciar errores
$sqlLog  = "INSERT INTO tblog_verificador (IDProducto, NombreProducto, Precio, FechaHora)
            VALUES (?, ?, ?, GETDATE())";
$stmtLog = sqlsrv_query($conn, $sqlLog, [$row['IDProducto'], $row['Nombre'], $row['PrecioUnitario']]);
if ($stmtLog === false) {
    error_log('Error al registrar en tblog_verificador: ' . print_r(sqlsrv_errors(), true));
}

$foto = null;
foreach (['jpg', 'jpeg', 'png'] as $ext) {
    $ruta = "uploads/{$row['IDProducto']}.{$ext}";
    if (is_file(__DIR__ . '/' . $ruta)) {
        $foto = $ruta;
        break;
    }
}

$row['IDCategoria']    = (int)$row['IDCategoria'];
$row['PrecioUnitario'] = (float)$row['PrecioUnitario'];
$row['StockActual']    = (int)$row['StockActual'];
$row['Foto']           = $foto;

responder(['ok' => true, 'producto' => $row]);