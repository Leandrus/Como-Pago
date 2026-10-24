<?php
/**
 * Motor Evaluador de Alertas Push
 * ¿Cómo Pago en Venezuela?
 * 
 * Evalúa las condiciones para:
 * 1. Nueva publicación oficial de la tasa BCV del próximo período (+ porcentaje de cambio)
 * 2. Variaciones en la cotización de USDT mayores al umbral configurado por cada usuario (1%, 2%, 5%, 10%, 25%)
 */

require_once __DIR__ . '/WebPush.php';

class AlertEngine {
    private WebPush $push;

    public function __construct(?WebPush $push = null) {
        $this->push = $push ?: new WebPush();
    }

    /**
     * Consulta un endpoint HTTP con cURL
     */
    private function fetchJson(string $url): ?array {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'User-Agent: ComoPago-PushEngine/1.0 (+https://como-pago.leandrus.net)'
            ]
        ]);
        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($code === 200 && !empty($res)) {
            $data = json_decode($res, true);
            return is_array($data) ? $data : null;
        }
        return null;
    }

    /**
     * Ejecuta el ciclo completo de evaluación de alertas
     * 
     * @param float|null $currentBcv Tasa BCV actual si ya fue obtenida
     * @param float|null $currentUsdt Tasa USDT actual si ya fue obtenida
     * @return array Resumen de alertas enviadas
     */
    public function checkAndDispatch(?float $currentBcv = null, ?float $currentUsdt = null): array {
        $state = $this->push->getLastAlertState();
        $subscriptions = $this->push->loadSubscriptions();
        $expiredEndpoints = [];

        $bcvAlertsSent = 0;
        $usdtAlertsSent = 0;

        // Si no se proporcionaron tasas actuales, consultarlas desde api-dolar
        if ($currentBcv === null || $currentUsdt === null) {
            $ratesData = $this->fetchJson('https://api-dolar.leandrus.net/v1/dolares');
            if (is_array($ratesData)) {
                foreach ($ratesData as $item) {
                    if (($item['fuente'] ?? '') === 'oficial' && isset($item['promedio'])) {
                        $currentBcv = (float)$item['promedio'];
                    } else if (($item['fuente'] ?? '') === 'paralelo' && isset($item['promedio'])) {
                        $currentUsdt = (float)$item['promedio'];
                    }
                }
            }
        }

        // =========================================================================
        // 1. EVALUAR PRÓXIMA TASA OFICIAL BCV
        // =========================================================================
        $nextBcvData = $this->fetchJson('https://api-dolar.leandrus.net/v1/dolares/oficial/siguiente');
        if (is_array($nextBcvData) && ($nextBcvData['estado'] ?? '') !== 'no_disponible') {
            $nextRate = (float)($nextBcvData['promedio'] ?? ($nextBcvData['precio'] ?? ($nextBcvData['venta'] ?? 0)));
            $nextDate = $nextBcvData['fechaActualizacion'] ?? ($nextBcvData['fechaVigente'] ?? ($nextBcvData['fecha'] ?? null));

            if ($nextRate > 0 && !empty($nextDate)) {
                $lastNotifiedDate = $state['last_notified_bcv_date'] ?? null;
                $lastNotifiedRate = $state['last_notified_bcv_rate'] ?? null;

                // Verificar si es una publicación nueva que aún no ha sido notificada
                $isNewPublication = ($nextDate !== $lastNotifiedDate || abs($nextRate - (float)$lastNotifiedRate) > 0.0001);

                if ($isNewPublication) {
                    $baseBcv = $currentBcv ?: $lastNotifiedRate;
                    $diff = $baseBcv ? ($nextRate - $baseBcv) : 0;
                    $pctChange = ($baseBcv > 0) ? round(($diff / $baseBcv) * 100, 2) : 0;
                    $sign = ($pctChange >= 0) ? '+' : '';
                    $formattedPct = "{$sign}{$pctChange}%";

                    // Formatear fecha legible
                    $cleanDate = substr($nextDate, 0, 10);
                    $dateParts = explode('-', $cleanDate);
                    $formattedDate = (count($dateParts) === 3) ? "{$dateParts[2]}/{$dateParts[1]}/{$dateParts[0]}" : $cleanDate;

                    $formattedRate = number_format($nextRate, 2, ',', '.') . ' Bs.';

                    $bcvPayload = [
                        'title' => '🟢 BCV Publica Nueva Tasa Oficial.',
                        'body' => "{$formattedRate} ({$formattedPct}). Vigente para el {$formattedDate}",
                        'icon' => './icons/icon-192x192.png',
                        'badge' => './icons/icon-192x192.png',
                        'tag' => 'bcv-next-' . $cleanDate,
                        'url' => './'
                    ];

                    foreach ($subscriptions as $id => $sub) {
                        $wantsBcv = !empty($sub['preferences']['bcv']);
                        if (!$wantsBcv) continue;

                        $res = $this->push->sendPush($sub, $bcvPayload);
                        if ($res['success']) {
                            $bcvAlertsSent++;
                        } else if ($res['expired']) {
                            $expiredEndpoints[] = $sub['endpoint'];
                        }
                    }

                    $state['last_notified_bcv_date'] = $nextDate;
                    $state['last_notified_bcv_rate'] = $nextRate;
                }
            }
        }

        // =========================================================================
        // 2. EVALUAR CAMBIOS DE PRECIOS USDT CON UMBRALES SELECCIONADOS
        // =========================================================================
        if ($currentUsdt !== null && $currentUsdt > 0) {
            foreach ($subscriptions as $id => &$sub) {
                $wantsUsdt = !isset($sub['preferences']['usdt']) || !empty($sub['preferences']['usdt']);
                if (!$wantsUsdt) {
                    continue;
                }

                $threshold = (int)($sub['preferences']['usdt_threshold'] ?? 2);
                $prevRate = $sub['last_usdt_rate'] ?? ($state['last_broadcast_usdt_rate'] ?? null);

                if ($prevRate === null) {
                    // Primer registro para este usuario: guardar punto de referencia
                    $sub['last_usdt_rate'] = $currentUsdt;
                    continue;
                }

                $prevRate = (float)$prevRate;
                if ($prevRate <= 0) {
                    $sub['last_usdt_rate'] = $currentUsdt;
                    continue;
                }

                $diff = $currentUsdt - $prevRate;
                $pctChange = round(($diff / $prevRate) * 100, 2);
                $absPct = abs($pctChange);

                if ($absPct >= $threshold) {
                    $icon = ($pctChange >= 0) ? '📈' : '📉';
                    $direction = ($pctChange >= 0) ? 'subió' : 'bajó';
                    $sign = ($pctChange >= 0) ? '+' : '';
                    $currentFmt = number_format($currentUsdt, 2, ',', '.') . ' Bs.';
                    $prevFmt = number_format($prevRate, 2, ',', '.') . ' Bs.';

                    $usdtPayload = [
                        'title' => "{$icon} USDT {$direction}.",
                        'body' => "{$sign}{$pctChange}% = {$currentFmt} (antes {$prevFmt}).",
                        'icon' => './icons/icon-192x192.png',
                        'badge' => './icons/icon-192x192.png',
                        'tag' => 'usdt-change-' . time(),
                        'url' => './'
                    ];

                    $res = $this->push->sendPush($sub, $usdtPayload);
                    if ($res['success']) {
                        $usdtAlertsSent++;
                        $sub['last_usdt_rate'] = $currentUsdt;
                    } else if ($res['expired']) {
                        $expiredEndpoints[] = $sub['endpoint'];
                    }
                }
            }
            unset($sub); // Romper referencia

            $state['last_broadcast_usdt_rate'] = $currentUsdt;
        }

        // Guardar cambios en suscripciones y estado
        if (!empty($expiredEndpoints)) {
            $this->push->purgeExpired($expiredEndpoints);
        } else {
            $this->push->saveSubscriptions($subscriptions);
        }

        $this->push->saveLastAlertState($state);

        return [
            'success' => true,
            'bcvAlertsSent' => $bcvAlertsSent,
            'usdtAlertsSent' => $usdtAlertsSent,
            'totalSubscribers' => count($subscriptions),
            'purgedExpired' => count($expiredEndpoints),
            'timestamp' => date('c')
        ];
    }
}
