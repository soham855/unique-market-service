# Unique Market — OpenWA VPS

This directory is the production deployment skeleton for the WhatsApp transport layer.

## Architecture

WhatsApp (+91 7350060071)
        |
        v
OpenWA (Docker + persistent volume)
        |
        | HTTPS webhook
        v
Unique Market bot / Supabase backend
        |
        v
Supabase complaint + notification data

The OpenWA container uses a persistent Docker volume at /app/data. That volume is critical: it contains OpenWA's linked-session/auth data and its local application data. Do not use `docker compose down --volumes` during normal maintenance.

## VPS setup

1. Install Docker Engine + Docker Compose.
2. Clone the Unique Market repository.
3. Enter `deploy/openwa-vps`.
4. Copy `.env.example` to `.env` and set the real public origin.
5. Start:

   docker compose up -d

6. Check:

   docker compose ps
   docker compose logs --tail=100 openwa-api
   curl http://127.0.0.1:2785/api/health

7. Read the first admin API key:

   docker exec unique-market-openwa cat /app/data/.api-key

8. Use that key only to create a dedicated least-privilege operator key for the Unique Market bot/session integration.

## WhatsApp session

Create one OpenWA session named:

unique-market-7350060071

Then start it and scan the returned QR from the OpenWA dashboard/API.

For the business-critical number, use the whatsapp-web.js engine first because OpenWA documents it as the lower-risk engine compared with Baileys, at the cost of higher RAM.

## Webhook

Register a webhook for:

message.received
message.sent
message.ack
message.failed
session.status
session.qr
session.authenticated
session.disconnected
session.restriction

Use a strong random webhook secret. The receiver must verify the X-OpenWA-Signature HMAC header and deduplicate using X-OpenWA-Idempotency-Key.

## Important

This is an unofficial WhatsApp Web gateway, not Meta Cloud API. It has a non-zero account restriction/ban risk. Do not use it for bulk cold messaging. For revenue-critical flows, keep the official Meta Cloud API as the fallback.

## Migration rule

Do NOT disconnect + reconnect 7350060071 until the VPS stack has passed:

- OpenWA health check
- persistent-volume restart test
- session create/start test
- QR test
- send test
- inbound webhook test
- Supabase event write/read test
- bot reply test

Only then move the live number.
