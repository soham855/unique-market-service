# Unique Market WhatsApp / WeChaty service

This is a separate backend service for WhatsApp Web automation using WeChaty.

## Environment

- PORT
- WHATSAPP_API_KEY
- WECHATY_NAME

## Endpoints

- GET /health
- GET /status (x-api-key required)
- GET /qr (x-api-key required)
- POST /send (x-api-key required)

## First login

1. Deploy the service on a persistent Node/Docker host.
2. Open /qr using the API key.
3. Scan the QR from WhatsApp > Linked devices.
4. Wait for status=logged_in.
5. Keep the service running with persistent storage/session support.

Important: this is WhatsApp Web automation, not the official WhatsApp Business Cloud API. Use a dedicated business number and review WhatsApp's current terms before production use.
