from google.adk.agents import Agent
from config.settings import settings
from . import prompt

api_tester_agent = Agent(
    name="api_tester",
    model=settings.DEFAULT_MODEL,
    description=prompt.TESTER_AGENT_DESCRIPTION,
    instruction=prompt.TESTER_AGENT_INSTRUCTION,
)
