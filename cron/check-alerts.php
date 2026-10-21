<?php
/**
 * Cron Job para Chequeo y Envío de Alertas Web Push
 * ¿Cómo Pago en Venezuela?
 * 
 * Evalúa publicaciones de próxima tasa BCV y fluctuaciones de USDT.
 * Compatible con Hostinger Cron Jobs (modo CLI) o ejecución interna.
 */

date_default_timezone_set('America/Caracas');
ini_set('max_execution_time', 60);

$isCli = (php_sapi_name() === 'cli');

// Se bloquea el tráfico web directo si se accede sin autorización
if (!$isCli && !empty($_SERVER['REMOTE_ADDR'])) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'error' => 'Acceso denegado. Este script solo puede ejecutarse internamente (CLI Cron).'
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

require_once __DIR__ . '/../push/check_alerts_engine.php';

try {
    $engine = new AlertEngine();
    $result = $engine->checkAndDispatch();

    if ($isCli) {
        echo "[SUCCESS] Chequeo de alertas completado: BCV enviadas: {$result['bcvAlertsSent']} | USDT enviadas: {$result['usdtAlertsSent']} | Suscriptores: {$result['totalSubscribers']} | Purgadas: {$result['purgedExpired']}\n";
    } else {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    }
} catch (Throwable $e) {
    $errorMsg = 'Error en chequeo de alertas: ' . $e->getMessage();
    if ($isCli) {
        fwrite(STDERR, "[ERROR] $errorMsg\n");
    } else {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
    exit(1);
}
