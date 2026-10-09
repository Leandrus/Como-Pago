<?php
/**
 * Cron Job para Sincronización Automática de Tasas
 * ¿Cómo Pago en Venezuela?
 * 
 * Este script consulta ÚNICAMENTE a api-dolar.leandrus.net y actualiza
 * el archivo data/rates-history.json de forma incremental.
 * 
 * Compatible con Hostinger Cron Jobs (modo PHP o CLI) y llamadas HTTP protegidas.
 */

// 1. Configuración de Zona Horaria y Límites
date_default_timezone_set('America/Caracas');
ini_set('max_execution_time', 60);

// 2. Seguridad Estricta: Permitir ÚNICAMENTE ejecución por CLI (Hostinger Cron)
$isCli = (php_sapi_name() === 'cli');

// Se bloquea el 100% del tráfico web/HTTP para evitar ejecuciones externas no deseadas.
if (!$isCli && !empty($_SERVER['REMOTE_ADDR'])) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'error' => 'Acceso denegado. Este script solo puede ejecutarse internamente por el servidor (CLI Cron).'
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

// 4. Rutas de Archivos
$dataFile = realpath(__DIR__ . '/../data/rates-history.json');
if (!$dataFile) {
    // Si aún no existe la ruta absoluta, la construimos
    $dataFile = __DIR__ . '/../data/rates-history.json';
}

$apiUrl = 'https://api-dolar.leandrus.net/v1/dolares';

// 5. Consulta a la API Oficial con fallback
$response = false;
$httpCode = 0;
$curlError = '';

if (function_exists('curl_init')) {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $apiUrl,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'User-Agent: ComoPago-CronEngine/1.0 (+https://como-pago.leandrus.net)'
        ]
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
}

// Fallback con file_get_contents si cURL falló
if ($httpCode !== 200 || empty($response)) {
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 20,
            'header' => "Accept: application/json\r\nUser-Agent: ComoPago-CronEngine/1.0\r\n"
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false
        ]
    ]);
    $streamResponse = @file_get_contents($apiUrl, false, $ctx);
    if ($streamResponse !== false) {
        $response = $streamResponse;
        $httpCode = 200;
    }
}

if ($httpCode !== 200 || empty($response)) {
    $errorMsg = "Error al consultar la API ($httpCode): " . ($curlError ?: 'Respuesta vacía');
    if ($isCli) {
        fwrite(STDERR, "[ERROR] $errorMsg\n");
    } else {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
    exit(1);
}

$apiData = json_decode($response, true);
if (!is_array($apiData)) {
    $errorMsg = 'Formato de respuesta JSON inválido recibido de la API.';
    if ($isCli) {
        fwrite(STDERR, "[ERROR] $errorMsg\n");
    } else {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
    exit(1);
}

// 6. Extracción de Tasas
$bcvRate = null;
$usdtRate = null;
$rateDate = date('Y-m-d'); // Fecha de hoy en Venezuela por defecto

foreach ($apiData as $item) {
    if (!isset($item['fuente']) || !isset($item['promedio'])) continue;
    
    if ($item['fuente'] === 'oficial') {
        $bcvRate = round((float)$item['promedio'], 4);
        if (!empty($item['fechaActualizacion'])) {
            $extractedDate = substr($item['fechaActualizacion'], 0, 10);
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $extractedDate)) {
                $rateDate = $extractedDate;
            }
        }
    } else if ($item['fuente'] === 'paralelo') {
        $usdtRate = round((float)$item['promedio'], 4);
    }
}

if ($bcvRate === null && $usdtRate === null) {
    $errorMsg = 'No se encontraron tasas oficiales ni paralelas válidas en la respuesta.';
    if ($isCli) {
        fwrite(STDERR, "[ERROR] $errorMsg\n");
    } else {
        http_response_code(422);
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
    exit(1);
}

// 7. Cargar el Historial Existente
$historyPayload = [
    'lastUpdated' => date('c'),
    'source' => 'Como-Pago Historical Engine',
    'count' => 0,
    'rates' => []
];

if (file_exists($dataFile)) {
    $rawHistory = file_get_contents($dataFile);
    $decodedHistory = json_decode($rawHistory, true);
    if (is_array($decodedHistory) && isset($decodedHistory['rates']) && is_array($decodedHistory['rates'])) {
        $historyPayload = $decodedHistory;
    }
}

// Indexar registros por fecha para actualización eficiente
$ratesByDate = [];
foreach ($historyPayload['rates'] as $rateRecord) {
    if (isset($rateRecord['date'])) {
        $ratesByDate[$rateRecord['date']] = $rateRecord;
    }
}

// 8. Insertar o Actualizar el Registro de la Fecha
$action = 'unchanged';
if (!isset($ratesByDate[$rateDate])) {
    $ratesByDate[$rateDate] = [
        'date' => $rateDate,
        'bcv' => $bcvRate,
        'usdt' => $usdtRate
    ];
    $action = 'inserted';
} else {
    $existing = $ratesByDate[$rateDate];
    $hasChanged = false;
    
    if ($bcvRate !== null && $existing['bcv'] !== $bcvRate) {
        $ratesByDate[$rateDate]['bcv'] = $bcvRate;
        $hasChanged = true;
    }
    if ($usdtRate !== null && $existing['usdt'] !== $usdtRate) {
        $ratesByDate[$rateDate]['usdt'] = $usdtRate;
        $hasChanged = true;
    }
    
    if ($hasChanged) {
        $action = 'updated';
    }
}

// 9. Reordenar Cronológicamente y Guardar en Disco
ksort($ratesByDate);
$finalRatesList = array_values($ratesByDate);

$historyPayload['lastUpdated'] = date('c');
$historyPayload['count'] = count($finalRatesList);
$historyPayload['rates'] = $finalRatesList;

$jsonData = json_encode($historyPayload, JSON_UNESCAPED_SLASHES);

// Guardado atómico con bloqueo exclusivo
$bytesWritten = file_put_contents($dataFile, $jsonData, LOCK_EX);

if ($bytesWritten === false) {
    $errorMsg = 'Error de permisos: No se pudo escribir en ' . $dataFile;
    if ($isCli) {
        fwrite(STDERR, "[ERROR] $errorMsg\n");
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
    exit(1);
}

// 10. Salida Exitosa
$result = [
    'success' => true,
    'action' => $action,
    'date' => $rateDate,
    'rates' => [
        'bcv' => $bcvRate,
        'usdt' => $usdtRate
    ],
    'totalRecords' => count($finalRatesList),
    'fileSizeBytes' => $bytesWritten,
    'timestamp' => date('Y-m-d H:i:s T')
];

if ($isCli) {
    echo "[SUCCESS] Acción: {$action} | Fecha: {$rateDate} | BCV: {$bcvRate} | USDT: {$usdtRate} | Total: " . count($finalRatesList) . " registros\n";
} else {
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
}
