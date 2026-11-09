
from io import BytesIO

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pypdf import PdfReader
from docx import Document


# ==========================================
# RE:KNOWLEDGE API
# ==========================================

app = FastAPI(
    title="RE:KNOWLEDGE API",
    description="Knowledge continuity and intelligent handover API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)


# ==========================================
# CORS
# ==========================================


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://re-knowledge-app-2026.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)



# ==========================================
# REQUEST MODEL
# ==========================================

class KnowledgeInput(BaseModel):
    project_name: str
    content: str


# ==========================================
# HOME / HEALTH CHECK
# ==========================================

@app.get("/")
def home():
    return {
        "message": "RE:KNOWLEDGE backend is running!",
        "status": "online"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "application": "RE:KNOWLEDGE"
    }


# ==========================================
# PROJECT KNOWLEDGE ANALYSIS
# ==========================================

@app.post("/analyze")
def analyze(data: KnowledgeInput):

    content = data.content.strip()
    lower_content = content.lower()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Please provide project knowledge to analyze."
        )

    decisions = []
    blockers = []
    risks = []

    if any(word in lower_content for word in [
        "decision", "decided", "approved", "selected"
    ]):
        decisions.append(
            "Potential project decision identified."
        )

    if any(word in lower_content for word in [
        "blocked", "blocker", "waiting", "delayed"
    ]):
        blockers.append(
            "Potential project blocker identified."
        )

    if any(word in lower_content for word in [
        "risk", "issue", "problem", "concern"
    ]):
        risks.append(
            "Potential project risk identified."
        )

    if not decisions:
        decisions.append("No explicit decisions detected.")

    if not blockers:
        blockers.append("No explicit blockers detected.")

    if not risks:
        risks.append("No explicit risks detected.")

    return {
        "project_name": data.project_name,
        "summary": f"Analyzed {len(content.split())} words.",
        "decisions": decisions,
        "blockers": blockers,
        "risks": risks,
        "status": "analysis_complete"
    }


# ==========================================
# DOCUMENT UPLOAD
# ==========================================

@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    project_name: str = Form(...)
):

    filename = file.filename or "uploaded_file"

    if "." not in filename:
        raise HTTPException(
            status_code=400,
            detail="File extension is missing."
        )

    extension = filename.rsplit(".", 1)[-1].lower()

    allowed_extensions = ["pdf", "docx", "txt", "md"]

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, DOCX, TXT and MD files are supported."
        )

    file_bytes = await file.read(10 * 1024 * 1024 + 1)

    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="Maximum file size is 10 MB."
        )

    if not file_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty."
        )

    extracted_text = ""

    try:

        if extension == "pdf":

            pdf = PdfReader(BytesIO(file_bytes))

            if pdf.is_encrypted:
                raise HTTPException(
                    status_code=400,
                    detail="Password-protected PDFs are not supported."
                )

            extracted_text = "\n".join(
                page.extract_text() or ""
                for page in pdf.pages
            )

        elif extension == "docx":

            document = Document(BytesIO(file_bytes))

            paragraphs = [
                paragraph.text
                for paragraph in document.paragraphs
                if paragraph.text.strip()
            ]

            tables = []

            for table in document.tables:
                for row in table.rows:
                    tables.append(
                        " | ".join(cell.text for cell in row.cells)
                    )

            extracted_text = "\n".join(paragraphs + tables)

        elif extension in ["txt", "md"]:

            extracted_text = file_bytes.decode("utf-8-sig")

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=f"Document extraction failed: {str(error)}"
        )

    if not extracted_text.strip():
        raise HTTPException(
            status_code=400,
            detail="No readable text found in this document."
        )

    return {
        "filename": filename,
        "project_name": project_name,
        "content": extracted_text,
        "word_count": len(extracted_text.split()),
        "status": "extraction_complete"
    }
