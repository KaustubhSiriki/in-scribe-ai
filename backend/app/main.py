import os
import shutil
import uuid
import logging
import fitz
import traceback
from datetime import datetime

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    HTTPException,
    BackgroundTasks,
    Form,
    Response,
    Request,
)
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain.chains.summarize import load_summarize_chain
from langchain.docstore.document import Document as LangchainDocument
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.prompts import ChatPromptTemplate  # Add missing import
from langchain_core.output_parsers import StrOutputParser

from .supabase_client import get_supabase_admin_client
from supabase import Client as SupabaseClientType
from postgrest import APIError as PostgrestAPIError

# ------------------------
# Configuration & Constants
# ------------------------

dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path, override=True)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# FastAPI initialization
app = FastAPI(title="InScribe AI Backend Processing Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # dev ports for React and Vite
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Temporary upload directory
TEMP_UPLOAD_DIR = "temp_uploads"
os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)

# Retrieval & summarization parameters
SIMILARITY_THRESHOLD = 0.0    # include all chunks for initial matching
NUM_RELEVANT_CHUNKS = 3       # number of chunks to fetch for Q&A
MAX_SUMMARY_CHUNKS = 20       # target number of chunks for summarization

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize OpenAI clients if API key is present
llm_chat_client = None
embeddings_client = None
if OPENAI_API_KEY:
    try:
        llm_chat_client = ChatOpenAI(
            temperature=0.2,
            model_name="gpt-3.5-turbo",
            openai_api_key=OPENAI_API_KEY,
        )
        embeddings_client = OpenAIEmbeddings(
            model="text-embedding-3-small",
            openai_api_key=OPENAI_API_KEY,
        )
        logger.info("OpenAI clients initialized.")
    except Exception:
        logger.exception("Failed to initialize OpenAI clients.")
else:
    logger.warning("OPENAI_API_KEY not found. AI features disabled.")

# ------------------------
# Pydantic Models
# ------------------------

class ProcessInitiationResponse(BaseModel):
    document_db_id: str
    message: str
    file_name: str

class AnalysisStatusResponse(BaseModel):
    document_db_id: str
    status: str
    summary_short: str | None = None
    key_findings: list[str] | None = None
    error_message: str | None = None
    qna_ready: bool = False

class DocumentQuery(BaseModel):
    query_text: str

class QueryResponse(BaseModel):
    answer: str
    relevant_chunks_preview: list[str] | None = None
    error: str | None = None

# ------------------------
# Helper Functions
# ------------------------

def handle_supabase_response(response, operation: str):
    """
    Checks Supabase response; raises HTTPException on failure.
    """
    if hasattr(response, "status_code") and not (200 <= response.status_code < 300):
        msg = getattr(response, "status_text", f"HTTP {response.status_code}")
        logger.error(f"Supabase {operation} error: {msg}")
        raise HTTPException(500, detail=f"DB error ({operation}): {msg}")
    err = getattr(response, "error", None)
    if err:
        logger.error(f"Supabase {operation} error: {err}")
        raise HTTPException(500, detail=f"DB error ({operation}): {err}")

# ------------------------
# PDF Text Extraction
# ------------------------

def extract_text_from_pdf(file_path: str) -> tuple[str, int]:
    """
    Extracts text from a PDF file and returns (full_text, page_count).
    """
    try:
        document = fitz.open(file_path)
        text_pages = [page.get_text("text") for page in document]
        document.close()
        return "\n".join(text_pages), len(text_pages)
    except Exception as e:
        logger.exception("Error extracting PDF text.")
        raise RuntimeError(f"PDF extraction failed: {e}")

# ------------------------
# Summarization with Scaling
# ------------------------

async def summarize_text_with_llm(text: str) -> str:
    """
    Summarizes long text by dynamically chunking and using a "refine" chain.
    Keeps the number of API calls low and avoids file descriptor exhaustion.
    """
    if not llm_chat_client:
        return "Error: LLM client not configured."

    total_length = len(text)
    # Compute chunk size to divide the text into ~MAX_SUMMARY_CHUNKS pieces
    chunk_size = max(total_length // MAX_SUMMARY_CHUNKS, 1000)
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=int(chunk_size * 0.1),
        length_function=len,
    )
    chunks = splitter.split_text(text)
    docs = [LangchainDocument(page_content=chunk) for chunk in chunks]

    # Use "refine" chain to incrementally summarize
    chain = load_summarize_chain(
        llm_chat_client,
        chain_type="refine",
        verbose=False,
    )

    logger.info(f"Summarizing {len(docs)} chunks via refine chain...")
    summary_text = await chain.arun(docs)
    return summary_text

# ------------------------
# Embedding & Chunk Storage
# ------------------------

async def generate_embeddings_and_store_chunks(
    supabase: SupabaseClientType,
    document_id: str,
    user_id: str,
    text: str,
) -> bool:
    """
    Splits text into chunks, computes embeddings, and stores them.
    """
    if not embeddings_client:
        logger.error("Embeddings client not initialized.")
        return False

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=100,
        length_function=len,
    )
    chunks = splitter.split_text(text)
    if not chunks:
        return True

    embeddings = embeddings_client.embed_documents(chunks)
    if len(embeddings) != len(chunks):
        logger.error("Mismatch between chunks and embeddings.")
        return False

    records = []
    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        records.append({
            "document_id": document_id,
            "user_id": user_id,
            "chunk_text": chunk,
            "embedding": emb,
            "chunk_order": i,
        })

    response = supabase.table("document_chunks").insert(records).execute()
    handle_supabase_response(response, f"store_chunks_{document_id}")
    return True

# ------------------------
# Background Processing Task
# ------------------------

async def process_document_and_store_analysis(
    document_db_id: str,
    user_id: str,
    file_path: str,
    original_filename: str,
):
    """Extracts, summarizes, embeds, and updates statuses."""
    supabase = get_supabase_admin_client()

    try:
        # Update to 'parsing'
        res = supabase.table("documents").update({"processing_status": "parsing"})\
                       .eq("id", document_db_id).execute()
        handle_supabase_response(res, "update_parsing")

        # Extract text
        text, _ = extract_text_from_pdf(file_path)

        # Update to 'analyzing'
        res = supabase.table("documents").update({"processing_status": "analyzing"})\
                       .eq("id", document_db_id).execute()
        handle_supabase_response(res, "update_analyzing")

        # Summarize
        summary = await summarize_text_with_llm(text)

        # Generate embeddings and store
        qna_ready = await generate_embeddings_and_store_chunks(
            supabase, document_db_id, user_id, text
        )

        # Insert into document_analyses
        analysis_payload = {
            "document_id": document_db_id,
            "user_id": user_id,
            "summary_short": summary,
            "qna_ready": qna_ready,
        }
        res = supabase.table("document_analyses").insert(analysis_payload).execute()
        handle_supabase_response(res, "insert_analysis")

        # Mark completed
        final_status = "completed" if qna_ready else "completed_no_qna"
        res = supabase.table("documents").update({"processing_status": final_status})\
                       .eq("id", document_db_id).execute()
        handle_supabase_response(res, "update_final")

    except Exception:
        logger.exception("Background processing error.")
        # Attempt to mark as failed
        supabase.table("documents").update({"processing_status": "failed"})\
                 .eq("id", document_db_id).execute()
    finally:
        # Clean up temp file
        try:
            os.remove(file_path)
        except OSError:
            pass

# ------------------------
# API Endpoints
# ------------------------

@app.post("/upload-and-process-pdf/", response_model=ProcessInitiationResponse)
async def upload_and_process_pdf(
    background_tasks: BackgroundTasks,
    user_id: str = Form(...),
    file: UploadFile = File(...),
):
    if file.content_type != "application/pdf":
        raise HTTPException(400, "Invalid file type. Only PDFs allowed.")

    document_db_id = str(uuid.uuid4())
    safe_name = f"{document_db_id}_{file.filename}"
    file_path = os.path.join(TEMP_UPLOAD_DIR, safe_name)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    supabase = get_supabase_admin_client()
    doc_meta = {
        "id": document_db_id,
        "user_id": user_id,
        "file_name": file.filename,
        "processing_status": "uploaded",
    }
    res = supabase.table("documents").insert(doc_meta).execute()
    handle_supabase_response(res, "create_document")

    background_tasks.add_task(
        process_document_and_store_analysis,
        document_db_id,
        user_id,
        file_path,
        file.filename,
    )

    return ProcessInitiationResponse(
        document_db_id=document_db_id,
        message="Uploaded successfully; processing started.",
        file_name=file.filename,
    )

@app.get("/analysis-status/{document_db_id}", response_model=AnalysisStatusResponse)
async def get_analysis_status(document_db_id: str, response: Response):
    # Prevent caching so clients always get the latest status and summary
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"

    supabase = get_supabase_admin_client()
    # Fetch document status and error
    doc_res = supabase.table("documents").select(
        "processing_status, error_message"
    ).eq("id", document_db_id).maybe_single().execute()
    handle_supabase_response(doc_res, "fetch_status")
    doc_data = doc_res.data or {}
    status = doc_data.get("processing_status", "unknown")
    error_msg = doc_data.get("error_message")

    summary = None
    key_findings = None
    qna_ready = False

    # If processing finished, fetch analysis details
    if status in ["completed", "completed_no_qna", "completed_with_errors"]:
        ana_res = supabase.table("document_analyses").select(
            "summary_short, key_findings, qna_ready"
        ).eq("document_id", document_db_id).maybe_single().execute()
        handle_supabase_response(ana_res, "fetch_analysis")
        ana_data = ana_res.data or {}
        summary = ana_data.get("summary_short")
        key_findings = ana_data.get("key_findings")
        qna_ready = ana_data.get("qna_ready", False)

    return AnalysisStatusResponse(
        document_db_id=document_db_id,
        status=status,
        summary_short=summary,
        key_findings=key_findings,
        error_message=error_msg,
        qna_ready=qna_ready,
    )

@app.post("/query-document/{document_db_id}", response_model=QueryResponse)
async def query_document(document_db_id: str, query: DocumentQuery):
    supabase = get_supabase_admin_client()
    # Check QnA readiness
    chk = supabase.table("document_analyses").select("qna_ready")\
                 .eq("document_id", document_db_id).maybe_single().execute()
    handle_supabase_response(chk, "qna_readiness")
    if not (chk.data or {}).get("qna_ready"):
        raise HTTPException(400, "Document not ready for querying.")

    # Embed the query
    embedding = embeddings_client.embed_query(query.query_text)

    # Retrieve relevant chunks
    rpc_res = supabase.rpc(
        "match_document_chunks",
        {
            "query_embedding": embedding,
            "match_threshold": SIMILARITY_THRESHOLD,
            "match_count": NUM_RELEVANT_CHUNKS,
            "doc_id": document_db_id,
        },
    ).execute()
    handle_supabase_response(rpc_res, "fetch_chunks")
    chunks = rpc_res.data or []

    # Fallback to summary if no chunks
    if not chunks:
        ana_res = supabase.table("document_analyses").select("summary_short")\
                     .eq("document_id", document_db_id).maybe_single().execute()
        summary = (ana_res.data or {}).get("summary_short", "No information available.")
        return QueryResponse(answer=summary)

    # Build context and invoke LLM
    context = "\n---\n".join(c["chunk_text"] for c in chunks)
    prompt = ChatPromptTemplate.from_messages([
        ("system", "Answer strictly based on the provided context."
                   " If information is missing, respond with 'I do not have enough information.'"),
        ("user", "Context:\n{context}\n\nQuestion: {question}"),
    ])
    chain = prompt | llm_chat_client | StrOutputParser()
    answer = await chain.ainvoke({"context": context, "question": query.query_text})

    return QueryResponse(
        answer=answer,
        relevant_chunks_preview=[c["chunk_text"][:100] + "..." for c in chunks],
    )

@app.post("/rename-document/")
async def rename_document(request: Request):
    body = await request.json()
    doc_id = body.get("id")
    new_name = body.get("new_name")
    user_id = body.get("user_id")  # Frontend sends session user id

    if not (doc_id and new_name and user_id):
        raise HTTPException(400, "id, new_name, and user_id are required.")

    supabase = get_supabase_admin_client()
    res = supabase.table("documents").update({"file_name": new_name})\
                  .eq("id", doc_id).eq("user_id", user_id).execute()
    handle_supabase_response(res, "rename_document")
    return {"success": True, "new_name": new_name}

@app.post("/delete-document/")
async def delete_document(request: Request):
    body = await request.json()
    doc_id = body.get("id")
    user_id = body.get("user_id")

    if not (doc_id and user_id):
        raise HTTPException(400, "id and user_id are required.")

    supabase = get_supabase_admin_client()
    # Remove document and related analysis/chunks
    supabase.table("document_analyses").delete().eq("document_id", doc_id).eq("user_id", user_id).execute()
    supabase.table("document_chunks").delete().eq("document_id", doc_id).eq("user_id", user_id).execute()
    res = supabase.table("documents").delete().eq("id", doc_id).eq("user_id", user_id).execute()
    handle_supabase_response(res, "delete_document")
    return {"success": True}