import os
from google.adk.agents import Agent
from config.settings import settings
from google.adk.tools.retrieval.vertex_ai_rag_retrieval import VertexAiRagRetrieval
from vertexai.preview import rag
from . import prompt

# ask_vertex_retrieval = VertexAiRagRetrieval(
#     name='retrieve_rag_documentation',
#     description=(
#         'Use this tool to retrieve documentation and reference materials for the question from the RAG corpus,'
#     ),
#     rag_resources=[
#         rag.RagResource(
#             rag_corpus=os.environ.get("RAG_CORPUS")
#         )
#     ],
#     similarity_top_k=10,
#     vector_distance_threshold=0.6,
# )

api_designer_agent = Agent(
    name="api_designer",
    model=settings.DEFAULT_MODEL,
    description=prompt.DESIGNER_AGENT_DESCRIPTION,
    instruction=prompt.DESIGNER_AGENT_INSTRUCTION,
)
