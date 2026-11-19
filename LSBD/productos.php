<?php
declare(strict_types=1);
require_once 'conexion.php';

if (!isset($_SESSION['user'])) {
    responder(['ok' => false, 'error' => 'Debes iniciar sesión.'], 401);
}

$accion = $_GET['accion'] ?? $_POST['accion'] ?? '';
$uploadDir = __DIR__ . '/uploads';

function buscarFoto(string $id, string $uploadDir): ?string {
    if (!preg_match('/^\d{8,14}$/', $id)) {
        return null;
    }
    foreach (['jpg', 'jpeg', 'png'] as $ext) {
        if (is_file("{$uploadDir}/{$id}.{$ext}")) {
            return "uploads/{$id}.{$ext}";
        }
    }
    return null;
}

// 1. Obtener categorías (cualquier usuario autenticado)
if ($accion === 'categorias') {
    $stmt = sqlsrv_query($conn, 'SELECT IDCategoria, NombreCategoria FROM CategoriaProducto ORDER BY IDCategoria');
    if ($stmt === false) {
        error_log('Error al cargar categorías: ' . print_r(sqlsrv_errors(), true));
        responder(['ok' => false, 'error' => 'Error al obtener categorías.'], 500);
    }
    $cats = [];
    while ($row = sqlsrv_fetch_array($stmt, SQLSRV_FETCH_ASSOC)) {
        $row['IDCategoria'] = (int)$row['IDCategoria'];
        $cats[] = $row;
    }
    responder(['ok' => true, 'categorias' => $cats]);
}

// 2. Listar todos los productos (exclusivo Administrador)
if ($accion === 'listar') {
    if ($_SESSION['user']['role'] !== 'admin') {
        responder(['ok' => false, 'error' => 'Acceso restringido a administradores.'], 403);
    }
    $sql = "SELECT p.IDProducto, p.NombreProducto AS Nombre, p.MarcaProducto AS Marca,
                   p.IDCategoria, c.NombreCategoria, p.PrecioUnitario, p.StockActual
            FROM Productos p
            INNER JOIN CategoriaProducto c ON p.IDCategoria = c.IDCategoria
            ORDER BY p.NombreProducto";
    $stmt = sqlsrv_query($conn, $sql);
    if ($stmt === false) {
        error_log('Error al listar productos: ' . print_r(sqlsrv_errors(), true));
        responder(['ok' => false, 'error' => 'Error al consultar los productos.'], 500);
    }
    $productos = [];
    while ($row = sqlsrv_fetch_array($stmt, SQLSRV_FETCH_ASSOC)) {
        $row['PrecioUnitario'] = (float)$row['PrecioUnitario'];
        $row['StockActual']    = (int)$row['StockActual'];
        $row['IDCategoria']    = (int)$row['IDCategoria'];
        $row['Foto']           = buscarFoto($row['IDProducto'], $uploadDir);
        $productos[] = $row;
    }
    responder(['ok' => true, 'productos' => $productos]);
}

// 3. Crear o Editar producto
if ($accion === 'crear' || $accion === 'editar') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        responder(['ok' => false, 'error' => 'Método no permitido.'], 405);
    }
    verificarCsrf();

    if ($accion === 'editar' && $_SESSION['user']['role'] !== 'admin') {
        responder(['ok' => false, 'error' => 'Solo el administrador puede editar productos.'], 403);
    }

    $id     = trim($_POST['IDProducto'] ?? '');
    $nombre = trim($_POST['Nombre'] ?? '');
    $marca  = trim($_POST['Marca'] ?? '');
    $idCat  = filter_var($_POST['IDCategoria'] ?? '', FILTER_VALIDATE_INT);
    $precio = filter_var($_POST['PrecioUnitario'] ?? '', FILTER_VALIDATE_FLOAT);
    $stock  = filter_var($_POST['StockActual'] ?? '', FILTER_VALIDATE_INT);

    if (!preg_match('/^\d{8,14}$/', $id)) {
        responder(['ok' => false, 'error' => 'El código de barras debe tener entre 8 y 14 dígitos.'], 400);
    }
    if (mb_strlen($nombre) < 2 || mb_strlen($nombre) > 80 || mb_strlen($marca) < 2 || mb_strlen($marca) > 60) {
        responder(['ok' => false, 'error' => 'Nombre o marca fuera de longitud permitida.'], 400);
    }
    if ($idCat === false || $idCat <= 0) {
        responder(['ok' => false, 'error' => 'Selecciona una categoría válida.'], 400);
    }
    if ($precio === false || $precio <= 0 || $precio > 999999.99) {
        responder(['ok' => false, 'error' => 'El precio unitario debe ser mayor a 0.'], 400);
    }
    if ($stock === false || $stock < 0 || $stock > 1000000) {
        responder(['ok' => false, 'error' => 'El stock debe ser un entero mayor o igual a 0.'], 400);
    }

    // Validar fotografía ANTES de guardar en SQL (sin moverla todavía)
    $archivoFoto = null;
    $extFoto     = null;
    if (isset($_FILES['Fotografia']) && $_FILES['Fotografia']['error'] !== UPLOAD_ERR_NO_FILE) {
        $errCode = $_FILES['Fotografia']['error'];
        if ($errCode !== UPLOAD_ERR_OK) {
            responder(['ok' => false, 'error' => 'Error al subir la fotografía (revisa que no supere 5 MB).'], 400);
        }
        if ($_FILES['Fotografia']['size'] > 5 * 1024 * 1024) {
            responder(['ok' => false, 'error' => 'La fotografía no debe superar 5 MB.'], 400);
        }

        $tmpPath = $_FILES['Fotografia']['tmp_name'];
        $finfo   = new finfo(FILEINFO_MIME_TYPE);
        $mime    = $finfo->file($tmpPath);
        $imgInfo = @getimagesize($tmpPath);

        if (!in_array($mime, ['image/jpeg', 'image/png'], true) || $imgInfo === false) {
            responder(['ok' => false, 'error' => 'El archivo no es una imagen JPG o PNG válida.'], 400);
        }

        $archivoFoto = $tmpPath;
        $extFoto     = ($mime === 'image/png') ? 'png' : 'jpg';
    }

    // Ejecutar SQL primero
    if ($accion === 'crear') {
        $sql    = "INSERT INTO Productos (IDProducto, NombreProducto, MarcaProducto, IDCategoria, PrecioUnitario, StockActual)
                   VALUES (?, ?, ?, ?, ?, ?)";
        $params = [$id, $nombre, $marca, $idCat, round($precio, 2), $stock];
    } else {
        $sql    = "UPDATE Productos
                   SET NombreProducto = ?, MarcaProducto = ?, IDCategoria = ?, PrecioUnitario = ?, StockActual = ?
                   WHERE IDProducto = ?";
        $params = [$nombre, $marca, $idCat, round($precio, 2), $stock, $id];
    }

    $stmt = sqlsrv_query($conn, $sql, $params);
    if ($stmt === false) {
        $errors = sqlsrv_errors();
        $code   = $errors ? (int)$errors[0]['code'] : 0;
        if ($code === 2627 || $code === 2601) {
            responder(['ok' => false, 'error' => 'Ya existe un artículo con ese código de barras.'], 409);
        }
        if ($code === 547) {
            responder(['ok' => false, 'error' => 'La categoría seleccionada no es válida.'], 400);
        }
        error_log('Error al guardar producto: ' . print_r($errors, true));
        responder(['ok' => false, 'error' => 'Error al guardar el producto.'], 500);
    }

    // Guardar imagen solo después de que SQL tuvo éxito
    if ($archivoFoto !== null && $extFoto !== null) {
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }
        foreach (['jpg', 'jpeg', 'png'] as $oldExt) {
            $oldPath = "{$uploadDir}/{$id}.{$oldExt}";
            if (is_file($oldPath)) {
                unlink($oldPath);
            }
        }
        if (!move_uploaded_file($archivoFoto, "{$uploadDir}/{$id}.{$extFoto}")) {
            error_log("No se pudo mover la foto para el producto {$id}");
        }
    }

    responder(['ok' => true]);
}

// 4. Eliminar producto (exclusivo Administrador)
if ($accion === 'eliminar') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        responder(['ok' => false, 'error' => 'Método no permitido.'], 405);
    }
    verificarCsrf();

    if ($_SESSION['user']['role'] !== 'admin') {
        responder(['ok' => false, 'error' => 'Solo el administrador puede eliminar productos.'], 403);
    }

    $id = trim($_POST['IDProducto'] ?? '');
    if (!preg_match('/^\d{8,14}$/', $id)) {
        responder(['ok' => false, 'error' => 'Código de barras inválido.'], 400);
    }

    $stmt = sqlsrv_query($conn, 'DELETE FROM Productos WHERE IDProducto = ?', [$id]);
    if ($stmt === false) {
        error_log('Error al eliminar producto: ' . print_r(sqlsrv_errors(), true));
        responder(['ok' => false, 'error' => 'No se pudo eliminar el producto.'], 500);
    }

    foreach (['jpg', 'jpeg', 'png'] as $ext) {
        $path = "{$uploadDir}/{$id}.{$ext}";
        if (is_file($path)) {
            unlink($path);
        }
    }
    responder(['ok' => true]);
}

responder(['ok' => false, 'error' => 'Acción no reconocida.'], 400);