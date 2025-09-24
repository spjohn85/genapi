import os
from config.settings import settings
import uvicorn
from google.adk.cli.fast_api import get_fast_api_app
from fastapi.middleware.cors import CORSMiddleware

from arize.otel import register

tracer_provider = register(
    space_id = "U3BhY2U6MjY4NDI6N2Evbg==",
    api_key = settings.ARIZE_API_KEY,
    project_name = "genapi", # name this to whatever you would like
)

from openinference.instrumentation.litellm import LiteLLMInstrumentor

# Instrument LiteLLM
LiteLLMInstrumentor().instrument(tracer_provider=tracer_provider)

# Get the directory where main.py is located
AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
# Example session service URI (e.g., SQLite)
SESSION_SERVICE_URI = "sqlite:///./sessions.db"
# Example allowed origins for CORS
ALLOWED_ORIGINS = ["https://agent.apiprimer.com","https://genapi.apiprimer.com"]
# Set web=True if you intend to serve a web interface, False otherwise
SERVE_WEB_INTERFACE = True

# Call the function to get the FastAPI app instance
# Ensure the agent directory name matches your agent folder
app = get_fast_api_app(
    agents_dir=AGENT_DIR,
    session_service_uri=SESSION_SERVICE_URI, # Using the same URI for memory service
    allow_origins=ALLOWED_ORIGINS,
    web=SERVE_WEB_INTERFACE,
    #trace_to_cloud=True, # Enable tracing to Google - Cloud Trace
)

# Add CORS middleware to allow the custom UI to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
if __name__ == "__main__":
    # Use the PORT environment variable provided by Cloud Run, defaulting to 8080
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))