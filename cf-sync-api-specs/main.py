import os
import requests
from google.cloud import storage
from google import genai
from google.genai import types
from pinecone import Pinecone
from vertexai.preview.language_models import TextEmbeddingModel
import datetime
import json
import yaml

KONNECT_BASE_URL = os.environ.get("KONNECT_BASE_URL")
KONNECT_PAT = os.environ.get("KONNECT_PAT")  # Store securely in Secret Manager/ENV
GCS_BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME")  # Set in ENV
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX = "genapi"

pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index(PINECONE_INDEX)
genai_client = genai.Client()
storage_client = storage.Client()

def chunk_text(text, size=512, overlap=50):
    """
    Improved sliding window chunker that respects line breaks for better context preservation.
    """
    lines = text.splitlines()
    chunks = []
    current_chunk = []
    current_length = 0
    
    for line in lines:
        line_length = len(line) + 1  # Account for newline
        if current_length + line_length > size and current_chunk:
            chunks.append('\n'.join(current_chunk))
            # Calculate overlap lines roughly (assuming avg line ~50 chars)
            overlap_lines = max(0, len(current_chunk) - max(1, overlap // 50))
            current_chunk = current_chunk[-overlap_lines:]
            current_length = sum(len(l) + 1 for l in current_chunk)
        current_chunk.append(line)
        current_length += line_length
    
    if current_chunk:
        chunks.append('\n'.join(current_chunk))
    
    return chunks

# def embed_chunks(chunks, batch_size=5):
#     """
#     Batch embed chunks using Vertex AI textembedding-gecko@latest.
#     """
#     embeddings = []
#     model = TextEmbeddingModel.from_pretrained("text-embedding-005")
#     for i in range(0, len(chunks), batch_size):
#         batch = chunks[i:i + batch_size]
#         try:
#             resp = model.get_embeddings(batch)
#             # Extract embedding values as lists of floats
#             batch_embeds = [e.values for e in resp]
#             embeddings.extend(batch_embeds)
#         except Exception as e:
#             print(f"Error embedding batch starting at index {i}: {e}")
#             continue
#     return embeddings

def embed_chunks(chunks, batch_size=5):
    """
    Batch embed chunks using Gemini with error handling.
    Gemini API may have rate limits; adjust batch_size as needed.
    """
    embeddings = []
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        try:
            model = TextEmbeddingModel.from_pretrained("text-embedding-005")
            resp = model.get_embeddings(texts=batch, output_dimensionality=768)
            # Extract embeddings (list of lists of floats)
            batch_embeds = [emb.values for emb in resp]
            embeddings.extend(batch_embeds)
        except Exception as e:
            print(f"Error embedding batch starting at index {i}: {e}")
            # Optionally retry or handle failures
            continue
    return embeddings

def process_gcs_file(file_name, text):
    """
    Process a single file: chunk, embed, and upsert to Pinecone.
    """
    try:
        chunks = chunk_text(text)
        if not chunks:
            print(f"No chunks generated for file: {file_name}")
            return
        
        vectors = embed_chunks(chunks)
        if len(vectors) != len(chunks):
            print(f"Mismatch: {len(chunks)} chunks vs {len(vectors)} vectors for {file_name}")
            return
        
        pinecone_items = []
        for i, (chunk, vec) in enumerate(zip(chunks, vectors)):
            # Ensure vector is list of floats
            if not isinstance(vec, list) or not all(isinstance(v, float) for v in vec):
                print(f"Invalid vector format for chunk {i} in {file_name}")
                continue
            pinecone_items.append({
                "id": f"{file_name}-chunk-{i}",
                "values": vec,
                "metadata": {
                    "text": chunk,
                    "file": file_name,
                    "chunk_index": i,
                    "total_chunks": len(chunks)
                }
            })
        
        # Upsert in batches (Pinecone recommends max 100 per upsert)
        for start in range(0, len(pinecone_items), 100):
            batch = pinecone_items[start:start + 100]
            try:
                index.upsert(vectors=batch)
                print(f"Upserted batch {start // 100 + 1} for file {file_name}")
            except Exception as e:
                print(f"Error upserting batch for {file_name}: {e}")
    
    except Exception as e:
        print(f"Error processing file {file_name}: {e}")

def fetch_kong_apis():
    apis = []
    page = 1
    while True:
        resp = requests.get(
            f"{KONNECT_BASE_URL}/apis",
            headers={"Authorization": f"Bearer {KONNECT_PAT}"},
            params={"page[number]": page, "page[size]": 100}
        )
        resp.raise_for_status()
        data = resp.json()
        apis.extend(data.get("data", []))
        if not data.get("next_page"):
            break
        page += 1
    return apis

def fetch_latest_api_spec(api):
    # List API versions
    print(f"Fetching versions for API: {api['name']} (ID: {api['id']})")
    resp = requests.get(
        f"{KONNECT_BASE_URL}/apis/{api['id']}/versions",
        headers={"Authorization": f"Bearer {KONNECT_PAT}"}
    )
    resp.raise_for_status()
    versions = resp.json().get("data", [])
    if not versions:
        return None
    latest = sorted(versions, key=lambda v: v["created_at"], reverse=True)[0]
    # Fetch spec content
    spec_id = latest["id"]
    print(f"Fetching spec for API: {api['id']} (Spec ID: {latest['id']})")
    resp = requests.get(
        f"{KONNECT_BASE_URL}/apis/{api['id']}/versions/{spec_id}",
        headers={"Authorization": f"Bearer {KONNECT_PAT}"}
    )
    resp.raise_for_status()
    json_data = resp.json()
        
    # Extract and parse spec.content (which is a JSON string)
    content_str = json_data.get('spec', {}).get('content')
    if not content_str:
        print(f"No content found for : {api['name']} version {latest['version']}")
    return content_str, api["name"], latest["version"]

def upload_to_gcs(content, api_name, version):
    client = storage.Client()
    bucket = client.bucket(GCS_BUCKET_NAME)
    blob_name = f"specs/{api_name}_v{version}.yml"
    blob = bucket.blob(blob_name)
    if blob.exists():
        existing_content = blob.download_as_string().decode("utf-8")
        print(f"Converting to YAML: {blob_name}")
        data = json.loads(content)
        yaml_content = yaml.safe_dump(data, sort_keys=False)
        if existing_content == yaml_content:
            print(f"File {blob_name} already exists with identical content, skipping upload.")
            return
        print(f"Uploading existing {blob_name} to GCS bucket {GCS_BUCKET_NAME}")
        blob.upload_from_string(yaml_content, content_type="text/yaml")
        print(f"Embedding {blob_name} to Pinecone index {PINECONE_INDEX}")
        process_gcs_file(blob_name,yaml_content)
    else:
        print(f"Converting to YAML: {blob_name}")
        data = json.loads(content)
        yaml_content = yaml.safe_dump(data, sort_keys=False)
        print(f"Uploading new file {blob_name} to GCS bucket {GCS_BUCKET_NAME}")
        blob.upload_from_string(yaml_content, content_type="text/yaml")
        print(f"Embedding {blob_name} to Pinecone index {PINECONE_INDEX}")
        process_gcs_file(blob_name,yaml_content)

def main(request):
    apis = fetch_kong_apis()
    for api in apis:
        result = fetch_latest_api_spec(api)
        if result:
            content, api_name, version = result
            upload_to_gcs(content, api_name, version)
    return "Embedding and upsert completed for documents", 200
