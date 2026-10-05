import asyncio
import logging
import os
import aiohttp
from dotenv import load_dotenv
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, RunContext, cli, function_tool
from livekit.plugins import google

load_dotenv()

logger = logging.getLogger("unique-market-voice")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

SYSTEM_PROMPT = """
You are the AI voice receptionist for UNIQUE MARKET, Ichalkaranji.
Speak naturally in Marathi, Hindi, or English. Match the customer's language.
Be concise, polite, and human-like.

Your job is to create a service complaint.
Collect these details one at a time:
1. Problem/issue (for example: camera बंद आहे)
2. Customer or company name
3. Service address/location
4. Priority: urgent, normal, or low

Before creating a complaint, repeat the collected details and ask for confirmation.
Only after the customer confirms, call create_service_request.
Never invent a ticket number. After successful creation, tell the customer the ticket number returned by the system.
For CCTV/IT technical questions, collect enough information for a technician; do not pretend to have inspected equipment remotely.
"""

async def supabase_insert(path: str, payload: dict) -> dict:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Supabase credentials are not configured")
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    timeout = aiohttp.ClientTimeout(total=15)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, json=payload) as resp:
            body = await resp.text()
            if resp.status >= 300:
                raise RuntimeError(f"Supabase error {resp.status}: {body[:500]}")
            data = await resp.json()
            return data[0] if isinstance(data, list) and data else {}

class UniqueMarketAgent(Agent):
    def __init__(self):
        super().__init__(instructions=SYSTEM_PROMPT)

    @function_tool()
    async def create_service_request(
        self,
        context: RunContext,
        problem: str,
        customer_name: str,
        address: str,
        priority: str = "normal",
    ) -> str:
        """Create a confirmed Unique Market service complaint in Supabase."""
        normalized_priority = priority.strip().lower()
        if normalized_priority not in {"urgent", "normal", "low"}:
            normalized_priority = "normal"
        row = await supabase_insert("complaints", {
            "category": "Voice AI Service Request",
            "service_type": "Service",
            "title": problem,
            "description": problem,
            "priority": normalized_priority,
            "status": "open",
            "location_text": address,
            "address": address,
            "customer_name": customer_name,
            "customer_phone": "",
        })
        ticket = row.get("ticket_no") or row.get("complaint_no") or row.get("id")
        return f"Service request created successfully. Ticket number: {ticket}"

server = AgentServer(
    num_idle_processes=0,
    load_threshold=0.95,
)

def compute_load(agent_server: AgentServer) -> float:
    # Render free tier can report high CPU while Python starts. Admission is
    # based on active calls so the first Playground call is not rejected.
    return min(len(agent_server.active_jobs), 1.0)

server.load_fnc = compute_load

@server.rtc_session(agent_name="unique-market-voice")
async def entrypoint(ctx: JobContext):
    logger.info("UM VOICE: entrypoint started room=%s job=%s", ctx.room.name, ctx.job.id)
    await ctx.connect()
    logger.info("UM VOICE: LiveKit room connected")

    # Initialize the realtime plugin on the agent process, then yield once so
    # network/TLS setup and plugin initialization cannot monopolize the event loop.
    session = AgentSession(
        llm=google.realtime.RealtimeModel(
            model="gemini-2.5-flash-native-audio-preview-12-2025",
            voice="Puck",
            temperature=0.5,
            instructions=SYSTEM_PROMPT,
        ),
    )
    await asyncio.sleep(0)
    logger.info("UM VOICE: Gemini realtime session created")

    await session.start(
        room=ctx.room,
        agent=UniqueMarketAgent(),
    )
    await asyncio.sleep(0)
    logger.info("UM VOICE: AgentSession started; sending greeting")

    await session.generate_reply(
        instructions="Greet the customer in a natural Marathi/Hindi/English mix and ask how you can help with CCTV, IT service, or AMC."
    )
    logger.info("UM VOICE: greeting requested")

if __name__ == "__main__":
    cli.run_app(server)
