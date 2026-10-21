<?php
/**
 * API REST de Suscripciones y Alertas Push
 * ¿Cómo Pago en Venezuela?
 * 
 * Acciones soportadas:
 *  - GET  ?action=public-key
 *  - POST ?action=subscribe
 *  - POST ?action=unsubscribe
 *  - POST ?action=preferences
 *  - POST ?action=test
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/WebPush.php';

try {
    $push = new WebPush();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = $_GET['action'] ?? ($_POST['action'] ?? '');

    // 1. Obtener Llave Pública VAPID
    if ($method === 'GET' && ($action === 'public-key' || empty($action))) {
        $keys = $push->getVapidKeys();
        echo json_encode([
            'success' => true,
            'publicKey' => $keys['publicKey']
        ], JSON_UNESCAPED_SLASHES);
        exit;
    }

    // Para métodos POST, leemos el cuerpo JSON
    if ($method === 'POST') {
        $rawInput = file_get_contents('php://input');
        $data = json_decode($rawInput, true);
        if (!is_array($data)) {
            $data = $_POST;
        }

        if (empty($action) && isset($data['action'])) {
            $action = $data['action'];
        }

        // 2. Suscribir Dispositivo
        if ($action === 'subscribe') {
            $subscription = $data['subscription'] ?? [];
            $preferences = $data['preferences'] ?? [];

            if (empty($subscription['endpoint']) || empty($subscription['keys']['p256dh']) || empty($subscription['keys']['auth'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Datos de suscripción Web Push incompletos o inválidos.']);
                exit;
            }

            // Sanitizar umbral USDT (1, 2, 5, 10, 25)
            $validThresholds = [1, 2, 5, 10, 25];
            $threshold = (int)($preferences['usdt_threshold'] ?? 2);
            if (!in_array($threshold, $validThresholds, true)) {
                $threshold = 2;
            }

            $sanitizedPrefs = [
                'bcv' => !empty($preferences['bcv']),
                'usdt' => !isset($preferences['usdt']) || !empty($preferences['usdt']),
                'usdt_threshold' => $threshold
            ];

            $ok = $push->upsertSubscription($subscription, $sanitizedPrefs);

            echo json_encode([
                'success' => $ok,
                'message' => $ok ? 'Dispositivo suscrito exitosamente a las alertas.' : 'Error al guardar suscripción.'
            ], JSON_UNESCAPED_SLASHES);
            exit;
        }

        // 3. Desuscribir Dispositivo
        if ($action === 'unsubscribe') {
            $endpoint = $data['endpoint'] ?? ($data['subscription']['endpoint'] ?? '');
            if (empty($endpoint)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Endpoint requerido para desuscripción.']);
                exit;
            }

            $ok = $push->removeSubscription($endpoint);
            echo json_encode([
                'success' => $ok,
                'message' => 'Dispositivo desuscrito correctamente.'
            ], JSON_UNESCAPED_SLASHES);
            exit;
        }

        // 4. Actualizar Preferencias de Alertas
        if ($action === 'preferences') {
            $endpoint = $data['endpoint'] ?? ($data['subscription']['endpoint'] ?? '');
            $preferences = $data['preferences'] ?? [];

            if (empty($endpoint)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Endpoint requerido para actualizar preferencias.']);
                exit;
            }

            $validThresholds = [1, 2, 5, 10, 25];
            $threshold = (int)($preferences['usdt_threshold'] ?? 2);
            if (!in_array($threshold, $validThresholds, true)) {
                $threshold = 2;
            }

            $sanitizedPrefs = [
                'bcv' => !empty($preferences['bcv']),
                'usdt' => !isset($preferences['usdt']) || !empty($preferences['usdt']),
                'usdt_threshold' => $threshold
            ];

            $ok = $push->updatePreferences($endpoint, $sanitizedPrefs);
            echo json_encode([
                'success' => $ok,
                'message' => $ok ? 'Preferencias de alertas actualizadas.' : 'No se encontró la suscripción.'
            ], JSON_UNESCAPED_SLASHES);
            exit;
        }

        // 5. Enviar Alerta de Prueba Inmediata
        if ($action === 'test') {
            $subscription = $data['subscription'] ?? [];
            if (empty($subscription['endpoint'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Suscripción requerida para prueba.']);
                exit;
            }

            $testPayload = [
                'title' => '🔔 ¿Cómo Pago? — Alerta de Prueba',
                'body' => '¡Las notificaciones Web Push nativas están activas y funcionando en tu dispositivo!',
                'icon' => './icons/icon-192x192.png',
                'badge' => './icons/icon-192x192.png',
                'tag' => 'como-pago-test-' . time(),
                'url' => './'
            ];

            $result = $push->sendPush($subscription, $testPayload);

            if ($result['expired']) {
                $push->removeSubscription($subscription['endpoint']);
            }

            echo json_encode([
                'success' => $result['success'],
                'statusCode' => $result['statusCode'],
                'error' => $result['error']
            ], JSON_UNESCAPED_SLASHES);
            exit;
        }
    }

    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Acción no encontrada o método no permitido.']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_SLASHES);
}
