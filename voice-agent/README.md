# Unique Market Voice AI

LiveKit + Gemini realtime voice agent for Unique Market.

## Flow

Voice -> LiveKit -> Gemini Live -> service details -> customer confirmation -> Supabase complaint.

## Required secrets

Set these as deployment environment variables. Never commit them:

- LIVEKIT_URL
- LIVEKIT_API_KEY
- LIVEKIT_API_SECRET
- GOOGLE_API_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

The Gemini API has a free tier subject to Google's current quota/rate limits. LiveKit Cloud/telephony usage can have separate limits or charges.

## Local test

Python 3.10+:

    cd voice-agent
    python -m venv .venv
    .venv/bin/pip install -r requirements.txt
    python agent.py dev

Do not connect the Vi phone number yet. First test the agent in a LiveKit room.

## Production

Deploy this folder as a separate LiveKit Agent service. Keep the existing WhatsApp Render service unchanged.
