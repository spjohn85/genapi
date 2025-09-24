import os
from dotenv import load_dotenv
from google.adk.models.lite_llm import LiteLlm # For LLM interaction

load_dotenv()

class Settings:
    ADK_AGENT_HOST: str = os.getenv("ADK_AGENT_HOST", "127.0.0.1")
    ADK_AGENT_PORT: int = int(os.getenv("ADK_AGENT_PORT", 8000))
    # Add any other settings here, like API keys
    ARIZE_API_KEY: str = os.getenv("ARIZE_API_KEY")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY") # For Gemini models if used via LiteLlm
    GIT_TOKEN: str = os.getenv("APIPRIMER_GIT_TOKEN")
    RAG_CORPUS: str = os.getenv("RAG_CORPUS","projects/apiprimer/locations/europe-west3/ragCorpora/3596124302455341056")
    DEFAULT_MODEL = LiteLlm(
        # "ollama_chat/llama3.1"
        model="gemini/gemini-2.0-flash",
        base_url=os.getenv("LITELLM_BASE_URL", "https://api.apiprimer.com/agent-route"),
    )

settings = Settings()