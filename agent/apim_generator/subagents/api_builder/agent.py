from google.adk.agents import Agent
from config.settings import settings
from . import prompt

api_builder_agent = Agent(
    name="api_builder",
    model=settings.DEFAULT_MODEL,
    description=prompt.BUILDER_AGENT_DESCRIPTION,
    instruction=prompt.BUILDER_AGENT_INSTRUCTION,
)
