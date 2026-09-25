# Unique Market WhatsApp Bot

Baileys-based WhatsApp service for Unique Market.

## Render environment

Set:

- PORT: Render provides this automatically.
- WA_PHONE_NUMBER: WhatsApp number in international digits only, for example 9198XXXXXXXX.
- WA_AUTH_DIR: optional, defaults to `whatsapp-bot/auth_info`.
- WA_LOG_LEVEL: optional, defaults to `silent`.

Start command:

`npm run whatsapp:bot`

## Pairing

After deployment:

1. Open `/status`.
2. If `pairingRequired` is true, call `POST /pair`.
3. Open WhatsApp on the phone.
4. Go to Linked devices -> Link a device.
5. Enter the returned pairing code.

## Sending

`POST /send`

JSON:

`{"phone":"9198XXXXXXXX","message":"Test message from Unique Market" }`

The auth directory contains the WhatsApp session credentials. Never commit it to GitHub or expose it publicly.

For Render, use persistent storage for the auth directory; otherwise a restart/redeploy can require pairing again.
