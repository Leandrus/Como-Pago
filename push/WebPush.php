<?php
/**
 * Motor Nativo de Web Push (RFC 8291 + RFC 8292 VAPID)
 * ¿Cómo Pago en Venezuela?
 * 
 * Implementación 100% nativa en PHP 8+ utilizando OpenSSL.
 * Sin dependencias de terceros (Firebase, OneSignal, Composer).
 */

class WebPush {
    private string $storageDir;
    private string $keysFile;
    private string $subscriptionsFile;
    private string $stateFile;
    private string $contactSubject;

    public function __construct(?string $storageDir = null, string $contactSubject = 'mailto:soporte@como-pago.leandrus.net') {
        $this->storageDir = $storageDir ?: (__DIR__ . '/data');
        if (!is_dir($this->storageDir)) {
            @mkdir($this->storageDir, 0750, true);
        }

        $this->keysFile = $this->storageDir . '/vapid_keys.json';
        $this->subscriptionsFile = $this->storageDir . '/subscriptions.json';
        $this->stateFile = $this->storageDir . '/last_alert_state.json';
        $this->contactSubject = $contactSubject;
    }

    /**
     * Codificación Base64URL segura (RFC 7515)
     */
    public static function base64UrlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    /**
     * Decodificación Base64URL
     */
    public static function base64UrlDecode(string $data): string {
        return base64_decode(strtr($data, '-_', '+/'));
    }

    /**
     * Obtiene o genera las llaves VAPID (Curva P-256 / prime256v1)
     */
    public function getVapidKeys(): array {
        if (file_exists($this->keysFile)) {
            $content = file_get_contents($this->keysFile);
            $keys = json_decode($content, true);
            if (is_array($keys) && !empty($keys['publicKey']) && !empty($keys['privateKeyPem'])) {
                return $keys;
            }
        }

        // Generar nuevo par de claves P-256
        $cnfPath = __DIR__ . '/openssl.cnf';
        if (!file_exists($cnfPath)) {
            @file_put_contents($cnfPath, "# minimal openssl config\n");
        }

        $res = openssl_pkey_new([
            'config' => $cnfPath,
            'curve_name' => 'prime256v1',
            'private_key_type' => OPENSSL_KEYTYPE_EC
        ]);

        if (!$res) {
            throw new RuntimeException('No se pudo generar el par de claves VAPID EC: ' . openssl_error_string());
        }

        openssl_pkey_export($res, $privKeyPem, null, ['config' => $cnfPath]);
        $details = openssl_pkey_get_details($res);
        $rawPub = "\x04" . $details['ec']['x'] . $details['ec']['y'];
        $rawPriv = $details['ec']['d'];

        $keys = [
            'publicKey' => self::base64UrlEncode($rawPub),
            'privateKey' => self::base64UrlEncode($rawPriv),
            'privateKeyPem' => $privKeyPem,
            'createdAt' => date('c')
        ];

        file_put_contents($this->keysFile, json_encode($keys, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
        @chmod($this->keysFile, 0600);

        return $keys;
    }

    /**
     * Convierte una firma DER generada por OpenSSL al formato estándar IEEE P1363 (64 bytes: r + s)
     */
    private static function derToP1363(string $der): string {
        $pos = 2;
        if (ord($der[1]) & 0x80) {
            $pos += (ord($der[1]) & 0x7f);
        }
        // r
        $pos++;
        $rLen = ord($der[$pos++]);
        $r = substr($der, $pos, $rLen);
        $pos += $rLen;
        // s
        $pos++;
        $sLen = ord($der[$pos++]);
        $s = substr($der, $pos, $sLen);

        $r = ltrim($r, "\x00");
        $s = ltrim($s, "\x00");
        $r = str_pad($r, 32, "\x00", STR_PAD_LEFT);
        $s = str_pad($s, 32, "\x00", STR_PAD_LEFT);
        return $r . $s;
    }

    /**
     * Genera un token JWT VAPID (RFC 8292)
     */
    public function generateVapidJwt(string $endpoint): string {
        $keys = $this->getVapidKeys();
        $parsed = parse_url($endpoint);
        $audience = ($parsed['scheme'] ?? 'https') . '://' . ($parsed['host'] ?? '');

        $header = self::base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
        $payload = self::base64UrlEncode(json_encode([
            'aud' => $audience,
            'exp' => time() + 86400,
            'sub' => $this->contactSubject
        ]));

        $dataToSign = "$header.$payload";
        $privKey = openssl_pkey_get_private($keys['privateKeyPem']);
        if (!$privKey) {
            throw new RuntimeException('Clave privada VAPID no válida para firma.');
        }

        openssl_sign($dataToSign, $derSignature, $privKey, OPENSSL_ALGO_SHA256);
        $rawSignature = self::derToP1363($derSignature);

        return "$dataToSign." . self::base64UrlEncode($rawSignature);
    }

    /**
     * Cifra el payload en formato aes128gcm conforme a RFC 8291
     */
    public function encryptPayload(string $payload, string $clientPubBase64, string $clientAuthBase64): string {
        $clientPub = self::base64UrlDecode($clientPubBase64);
        $clientAuth = self::base64UrlDecode($clientAuthBase64);

        if (strlen($clientPub) !== 65 || ord($clientPub[0]) !== 4) {
            throw new InvalidArgumentException('Clave pública P-256 de cliente inválida.');
        }

        $cnfPath = __DIR__ . '/openssl.cnf';
        if (!file_exists($cnfPath)) {
            @file_put_contents($cnfPath, "# minimal openssl config\n");
        }

        // 1. Clave efímera del servidor
        $serverKey = openssl_pkey_new([
            'config' => $cnfPath,
            'curve_name' => 'prime256v1',
            'private_key_type' => OPENSSL_KEYTYPE_EC
        ]);
        $serverDetails = openssl_pkey_get_details($serverKey);
        $serverPub = "\x04" . $serverDetails['ec']['x'] . $serverDetails['ec']['y'];

        // 2. SPKI ASN.1 Header para prime256v1
        $spkiPrefix = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200');
        $clientPubPem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spkiPrefix . $clientPub), 64, "\n") . "-----END PUBLIC KEY-----\n";

        // 3. ECDH Shared Secret
        $sharedSecret = openssl_pkey_derive($clientPubPem, $serverKey);
        if (!$sharedSecret) {
            throw new RuntimeException('Fallo al derivar secreto compartido ECDH.');
        }

        $salt = random_bytes(16);

        // 4. Derivación de claves RFC 8291
        $keyInfo = "WebPush: info\0" . $clientPub . $serverPub;
        $prkKey = hash_hkdf('sha256', $sharedSecret, 32, $keyInfo, $clientAuth);

        $cek = hash_hkdf('sha256', $prkKey, 16, "Content-Encoding: aes128gcm\0", $salt);
        $nonce = hash_hkdf('sha256', $prkKey, 12, "Content-Encoding: nonce\0", $salt);

        // 5. Padding delimiter \x02
        $paddedPayload = $payload . "\x02";
        $ciphertext = openssl_encrypt($paddedPayload, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);

        // 6. Cabecera RFC 8291: Salt (16B) || RecordSize (4B) || KeyIdLen (1B = 65) || ServerPub (65B)
        $header = $salt . pack('N', 4096) . chr(65) . $serverPub;

        return $header . $ciphertext . $tag;
    }

    /**
     * Envía una notificación Web Push a un suscriptor
     * 
     * @return array [ 'success' => bool, 'statusCode' => int, 'expired' => bool, 'error' => ?string ]
     */
    public function sendPush(array $subscription, array $notificationData): array {
        $endpoint = $subscription['endpoint'] ?? '';
        $clientPub = $subscription['keys']['p256dh'] ?? '';
        $clientAuth = $subscription['keys']['auth'] ?? '';

        if (empty($endpoint) || empty($clientPub) || empty($clientAuth)) {
            return ['success' => false, 'statusCode' => 400, 'expired' => false, 'error' => 'Suscripción incompleta'];
        }

        $keys = $this->getVapidKeys();
        $jwt = $this->generateVapidJwt($endpoint);
        $payloadJson = json_encode($notificationData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $body = $this->encryptPayload($payloadJson, $clientPub, $clientAuth);

        $headers = [
            'Content-Type: application/octet-stream',
            'Content-Encoding: aes128gcm',
            'TTL: 86400',
            'Urgency: high',
            'Authorization: vapid t=' . $jwt . ', k=' . $keys['publicKey']
        ];

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $endpoint,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0
        ]);

        $response = curl_exec($ch);
        $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);

        $isSuccess = ($statusCode >= 200 && $statusCode < 300);
        $isExpired = ($statusCode === 404 || $statusCode === 410);

        return [
            'success' => $isSuccess,
            'statusCode' => $statusCode,
            'expired' => $isExpired,
            'error' => $isSuccess ? null : ($curlError ?: "HTTP $statusCode: $response")
        ];
    }

    /**
     * Gestión de Suscripciones Anónimas en JSON Plano
     */
    public function loadSubscriptions(): array {
        if (!file_exists($this->subscriptionsFile)) {
            return [];
        }
        $data = file_get_contents($this->subscriptionsFile);
        $list = json_decode($data, true);
        return is_array($list) ? $list : [];
    }

    public function saveSubscriptions(array $subscriptions): bool {
        return (bool) file_put_contents(
            $this->subscriptionsFile,
            json_encode($subscriptions, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            LOCK_EX
        );
    }

    public function upsertSubscription(array $subData, array $preferences = []): bool {
        $endpoint = $subData['endpoint'] ?? '';
        if (empty($endpoint)) return false;

        $id = hash('sha256', $endpoint);
        $subs = $this->loadSubscriptions();

        $existing = $subs[$id] ?? [];
        $subs[$id] = [
            'endpoint' => $endpoint,
            'keys' => [
                'p256dh' => $subData['keys']['p256dh'] ?? '',
                'auth' => $subData['keys']['auth'] ?? ''
            ],
            'preferences' => array_merge([
                'bcv' => true,
                'usdt' => true,
                'usdt_threshold' => 2
            ], $existing['preferences'] ?? [], $preferences),
            'last_usdt_rate' => $existing['last_usdt_rate'] ?? null,
            'created_at' => $existing['created_at'] ?? date('c'),
            'updated_at' => date('c')
        ];

        return $this->saveSubscriptions($subs);
    }

    public function removeSubscription(string $endpoint): bool {
        $id = hash('sha256', $endpoint);
        $subs = $this->loadSubscriptions();
        if (isset($subs[$id])) {
            unset($subs[$id]);
            return $this->saveSubscriptions($subs);
        }
        return true;
    }

    public function updatePreferences(string $endpoint, array $preferences): bool {
        $id = hash('sha256', $endpoint);
        $subs = $this->loadSubscriptions();
        if (isset($subs[$id])) {
            $subs[$id]['preferences'] = array_merge($subs[$id]['preferences'] ?? [], $preferences);
            $subs[$id]['updated_at'] = date('c');
            return $this->saveSubscriptions($subs);
        }
        return false;
    }

    public function purgeExpired(array $expiredEndpoints): int {
        if (empty($expiredEndpoints)) return 0;
        $subs = $this->loadSubscriptions();
        $count = 0;
        foreach ($expiredEndpoints as $endpoint) {
            $id = hash('sha256', $endpoint);
            if (isset($subs[$id])) {
                unset($subs[$id]);
                $count++;
            }
        }
        if ($count > 0) {
            $this->saveSubscriptions($subs);
        }
        return $count;
    }

    /**
     * Gestión del estado de la última alerta emitida (para evitar duplicados)
     */
    public function getLastAlertState(): array {
        if (!file_exists($this->stateFile)) {
            return [
                'last_notified_bcv_date' => null,
                'last_notified_bcv_rate' => null,
                'last_broadcast_usdt_rate' => null,
                'last_updated' => null
            ];
        }
        $data = file_get_contents($this->stateFile);
        $json = json_decode($data, true);
        return is_array($json) ? $json : [];
    }

    public function saveLastAlertState(array $state): bool {
        $state['last_updated'] = date('c');
        return (bool) file_put_contents(
            $this->stateFile,
            json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            LOCK_EX
        );
    }
}
