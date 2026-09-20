# Unique Market WhatsApp Automation

Standalone Wechaty WhatsApp service for the Unique Market service-management platform.

Architecture:
Unique Market App -> Supabase -> this service -> WhatsApp

The existing web/app UI is not changed by this service.

Features:
- QR login for a dedicated WhatsApp automation number
- Health endpoint
- Authenticated single-message endpoint
- Authenticated service-event notification endpoint
- Supports complaint, technician assignment, started, completed and payment events
- No WhatsApp credentials or Supabase secrets committed

Run locally:
1. Copy .env.example to .env.
2. Set a long random BOT_API_KEY.
3. Run npm install.
4. Run npm start.
5. Scan the terminal QR with the dedicated WhatsApp number.

API:
GET /health

POST /send
Header: x-api-key: YOUR_BOT_API_KEY
Body:
{"phone":"919876543210","message":"Your service ticket UM26-001 has been completed."}

POST /notify
Header: x-api-key: YOUR_BOT_API_KEY
Body:
{
  "event":"Technician Assigned",
  "admin":"919876543210",
  "technician":{"name":"Technician Name","phone":"919812345678"},
  "customer":{"name":"ABC Industries","phone":"919876543210"},
  "ticket":{"id":"UM26-001","issue":"Camera offline","status":"Assigned"}
}

Production note:
This Wechaty WhatsApp Puppet uses WhatsApp Web automation rather than the official Meta Cloud API. Wechaty's current documentation describes the WhatsApp provider as alpha-stage and documents local/container deployment. Use a dedicated business number and a persistent Node/Docker host.
