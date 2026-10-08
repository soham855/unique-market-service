# Unique Market OpenWA — persistent Docker cut-over

Target:
WhatsApp 7350060071 -> OpenWA -> signed HTTPS webhook -> openwa-bridge -> Supabase.

OpenWA /app/data is stored in the named Docker volume unique-market-openwa-data, so the WhatsApp session and OpenWA SQLite state survive container restarts.

## Repo files

- docker-compose.openwa.yml — OpenWA + bridge
- Dockerfile.openwa-bridge — dependency-free Node 22 bridge
- whatsapp-bot/openwa-bridge.mjs — complaint flow, webhook verification, notification outbox
- .env.openwa.example — VPS environment template

The live Supabase database already has the WhatsApp ticket trigger: complaints with category "WhatsApp Service Request" receive UMWA-01, UMWA-02, ... automatically.

## VPS setup

1. Copy .env.openwa.example to .env.openwa.
2. Set the Supabase service-role key.
3. Set a real public HTTPS URL ending in /webhook as OPENWA_PUBLIC_WEBHOOK_URL.
4. Set a long random OPENWA_WEBHOOK_SECRET.
5. Start:
   docker compose --env-file .env.openwa -f docker-compose.openwa.yml up -d
6. Check:
   curl http://127.0.0.1:10000/health

The bridge automatically creates/recovers the OpenWA session, reads the generated OpenWA API key from the shared read-only data volume, registers the signed webhook, stores conversation state in Supabase, de-duplicates inbound events, creates WhatsApp complaints, and processes recent pending WhatsApp notification events.

## Pairing 7350060071

Use phone-number pairing:
curl -X POST http://127.0.0.1:10000/pairing-code

Then on WhatsApp 7350060071:
Settings -> Linked devices -> Link with phone number -> enter the code.

QR is also available at:
GET http://127.0.0.1:10000/qr

## Important cut-over rule

Do NOT keep the old Baileys/Render WhatsApp service connected to 7350060071 while OpenWA is being paired. Disconnect/logout the old session first, then pair the number once in OpenWA.

Do not run docker compose down -v; the named volume contains the persistent OpenWA state.

## Public webhook

OpenWA protects webhook delivery against SSRF. The bridge therefore expects a real public HTTPS URL, not a Docker hostname or localhost.

Example:
https://wa.yourdomain.com/webhook

Put your reverse proxy/TLS in front of port 10000. Do not expose OpenWA port 2785 publicly unless it is separately protected.
