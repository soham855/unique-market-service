# Unique Market WhatsApp — persistent VPS/Docker architecture

Target:
WhatsApp 7350060071 -> OpenWA Docker gateway -> signed webhook -> Unique Market backend -> Supabase.

A persistent filesystem is mandatory for a stable WhatsApp session. Render Free is not the right
place for this gateway because an ephemeral filesystem can lose session state.

OpenWA is the planned gateway layer. It provides REST APIs, signed webhooks, SQLite/PostgreSQL
storage and Docker deployment.

IMPORTANT: do not connect the same WhatsApp number to both Baileys and OpenWA at the same time.
Cut over only after the OpenWA adapter has been tested.

Immediate stable fallback in this repository:
docker-compose.whatsapp.yml

It uses the named volume:
unique-market-wa-auth:/app/whatsapp-bot/auth_info

VPS:
1. Install Docker + Compose.
2. Clone the repository.
3. Copy .env.whatsapp.example to .env.whatsapp and set secrets.
4. Run:
   docker compose -f docker-compose.whatsapp.yml up -d --build
5. Logs:
   docker compose -f docker-compose.whatsapp.yml logs -f unique-market-whatsapp
6. Health:
   curl http://127.0.0.1:10000/health

Do not set WA_FORCE_CLEAN_RESET=true during normal restarts. It intentionally deletes the
WhatsApp auth state and requires fresh pairing.

Do not expose port 10000 publicly without HTTPS/firewall protection.
