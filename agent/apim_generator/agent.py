import os
from google.adk.agents import Agent
from config.settings import settings
from google.adk.tools.agent_tool import AgentTool
from google.adk.tools.tool_context import ToolContext
from . import prompt
from .subagents.api_designer.agent import api_designer_agent
from .subagents.api_builder.agent import api_builder_agent
from .subagents.api_tester.agent import api_tester_agent
from .subagents.api_commiter.agent import api_committer_agent
import pathlib

def save_api_artifacts(openapi_spec: str, kong_declarative_config: str, insomnia_config: str, tool_context: ToolContext) -> str:
    """
    Saves the generated OpenAPI specification, Kong declarative configuration, and Insomnia configuration to files.

    Args:
        openapi_spec (str): The YAML content of the OpenAPI specification.
        kong_declarative_config (str): The YAML content of the Kong declarative configuration.
        insomnia_config (str): The JSON content of the Insomnia configuration.
        tool_context (ToolContext): The context for the tool, which can be used to store state.
        
    Returns:
        str: A message indicating the result of the operation.
    """
    try:
        userId = f"user_{os.urandom(8).hex()}"
        tool_context.state["user_id"] = userId
        OUTPUT_DIR = pathlib.Path(userId)
        OUTPUT_DIR.mkdir(exist_ok=True)
        path = OUTPUT_DIR / "openapi.yml"
        path.write_text(openapi_spec, encoding="utf-8")
        path = OUTPUT_DIR / "kong.yml"
        path.write_text(kong_declarative_config, encoding="utf-8")
        path = OUTPUT_DIR / "insomnia.json"
        path.write_text(insomnia_config, encoding="utf-8")
        OUTPUT_DIR = pathlib.Path(userId+"/.github/workflows")
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        path = OUTPUT_DIR / "deploy.yml"
        path.write_text("""
name: Deploy Konnect API

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  deploy:
    uses: genapis/kong-konnect-deploy/.github/workflows/deploy.yml@main
    with:
      REGION: eu
    secrets: inherit
    permissions:
      contents: read""", encoding="utf-8")

        return "Saved openapi.yml, kong.yml, and insomnia.json successfully."
    except Exception as e:
        return f"An error occurred while saving the files: {e}"

root_agent = Agent(
    name="apim_generator",
    model=settings.DEFAULT_MODEL,
    description=prompt.GENERATOR_AGENT_DESCRIPTION,
    instruction=prompt.GENERATOR_AGENT_INSTRUCTION,
    tools=[
        AgentTool(agent=api_designer_agent),
        AgentTool(agent=api_builder_agent),
        AgentTool(agent=api_tester_agent),
        AgentTool(agent=api_committer_agent),
        save_api_artifacts,
    ],
)
