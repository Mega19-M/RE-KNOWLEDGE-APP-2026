
import os, re, json, hmac, hashlib, secrets, uuid, math
from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import URLError
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from pypdf import PdfReader
from docx import Document

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./reknowledge.db")
if DATABASE_URL.startswith("postgres://"): DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"): DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()

class User(Base):
    __tablename__="users"
    id=Column(Integer, primary_key=True)
    email=Column(String(320), unique=True, index=True, nullable=False)
    name=Column(String(120), nullable=False)
    password_hash=Column(String(256), nullable=False)
    workspace_id=Column(String(36), index=True, nullable=False)
    created_at=Column(DateTime, default=datetime.utcnow)

class Project(Base):
    __tablename__="projects"
    id=Column(Integer, primary_key=True)
    workspace_id=Column(String(36), index=True, nullable=False)
    name=Column(String(180), nullable=False)
    description=Column(Text, default="")
    created_at=Column(DateTime, default=datetime.utcnow)

class KnowledgeDocument(Base):
    __tablename__="documents"
    id=Column(Integer, primary_key=True)
    workspace_id=Column(String(36), index=True, nullable=False)
    project_id=Column(Integer, ForeignKey("projects.id"), nullable=False)
    filename=Column(String(255), nullable=False)
    content=Column(Text, nullable=False)
    word_count=Column(Integer, default=0)
    uploaded_by=Column(Integer, ForeignKey("users.id"))
    created_at=Column(DateTime, default=datetime.utcnow)

class KnowledgeChunk(Base):
    __tablename__="knowledge_chunks"
    id=Column(Integer, primary_key=True)
    document_id=Column(Integer, ForeignKey("documents.id"), index=True, nullable=False)
    chunk_index=Column(Integer, nullable=False)
    content=Column(Text, nullable=False)
    embedding=Column(Text, nullable=True)

class Decision(Base):
    __tablename__="decisions"
    id=Column(Integer, primary_key=True)
    workspace_id=Column(String(36), index=True, nullable=False)
    project_id=Column(Integer, ForeignKey("projects.id"), nullable=False)
    title=Column(String(250), nullable=False)
    detail=Column(Text, default="")
    owner=Column(String(160), default="")
    status=Column(String(40), default="Open")
    dependencies=Column(Text, default="[]")
    version=Column(Integer, default=1)
    created_by=Column(Integer, ForeignKey("users.id"))
    created_at=Column(DateTime, default=datetime.utcnow)

class DecisionRevision(Base):
    __tablename__="decision_revisions"
    id=Column(Integer, primary_key=True)
    decision_id=Column(Integer, ForeignKey("decisions.id"), index=True, nullable=False)
    version=Column(Integer, nullable=False)
    snapshot=Column(Text, nullable=False)
    changed_by=Column(Integer, ForeignKey("users.id"))
    created_at=Column(DateTime, default=datetime.utcnow)

class Handover(Base):
    __tablename__="handovers"
    id=Column(Integer, primary_key=True)
    workspace_id=Column(String(36), index=True, nullable=False)
    project_id=Column(Integer, ForeignKey("projects.id"), nullable=False)
    version=Column(Integer, default=1)
    title=Column(String(250), nullable=False)
    report=Column(Text, nullable=False)
    receiving_team=Column(String(180), default="")
    acknowledged=Column(Boolean, default=False)
    acknowledged_by=Column(String(180), default="")
    acknowledged_at=Column(DateTime, nullable=True)
    created_by=Column(Integer, ForeignKey("users.id"))
    created_at=Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)
app=FastAPI(title="RE:KNOWLEDGE API", description="Persistent team knowledge, retrieval and handover API", version="2.0.0")
allowed_origins=[x.strip() for x in os.getenv("CORS_ORIGINS","https://re-knowledge-app-2026.vercel.app,http://localhost:5173").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

def get_db():
    db=SessionLocal()
    try: yield db
    finally: db.close()

def pw_hash(password, salt=None):
    salt=salt or secrets.token_hex(16)
    digest=hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 310000).hex()
    return f"{salt}${digest}"

def verify_pw(password, stored):
    try:
        salt,digest=stored.split("$",1)
        return hmac.compare_digest(pw_hash(password,salt).split("$",1)[1],digest)
    except Exception: return False

SECRET=os.getenv("JWT_SECRET")
if not SECRET:
    SECRET=secrets.token_urlsafe(48)
    print("WARNING: JWT_SECRET is not set. Set a stable secret in production or sessions will expire on restart.")

def make_token(user):
    payload={"sub":str(user.id),"workspace":user.workspace_id,"exp":int((datetime.now(timezone.utc)+timedelta(days=7)).timestamp())}
    body=secrets.token_urlsafe(1) # replaced below with deterministic base64url
    import base64
    body=base64.urlsafe_b64encode(json.dumps(payload,separators=(",",":")).encode()).decode().rstrip("=")
    sig=hmac.new(SECRET.encode(),body.encode(),hashlib.sha256).digest()
    return body+"."+base64.urlsafe_b64encode(sig).decode().rstrip("=")

def current_user(authorization: Optional[str]=Header(None), db: Session=Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "): raise HTTPException(401,"Sign in to continue.")
    import base64
    try:
        body,sig=authorization[7:].split(".",1)
        expected=base64.urlsafe_b64encode(hmac.new(SECRET.encode(),body.encode(),hashlib.sha256).digest()).decode().rstrip("=")
        if not hmac.compare_digest(sig,expected): raise ValueError()
        payload=json.loads(base64.urlsafe_b64decode(body+"="*((4-len(body)%4)%4)))
        if payload["exp"] < datetime.now(timezone.utc).timestamp(): raise ValueError()
        user=db.get(User,int(payload["sub"]))
        if not user or user.workspace_id != payload["workspace"]: raise ValueError()
        return user
    except Exception: raise HTTPException(401,"Session expired. Please sign in again.")

class AuthInput(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str]=None
    workspace_code: Optional[str]=None
class ProjectInput(BaseModel):
    name:str
    description:str=""
class AskInput(BaseModel):
    project_name:str
    question:str
class DecisionInput(BaseModel):
    project_name:str
    title:str
    detail:str=""
    owner:str=""
    status:str="Open"
    dependencies:list[str]=[]
class HandoverInput(BaseModel):
    project_name:str
    receiving_team:str=""
    title:str="Project handover"

def project_for(db,user,name,create=False):
    p=db.query(Project).filter_by(workspace_id=user.workspace_id,name=name).first()
    if not p and create:
        p=Project(workspace_id=user.workspace_id,name=name); db.add(p); db.commit(); db.refresh(p)
    if not p: raise HTTPException(404,"Project not found in this workspace.")
    return p

@app.get("/")
def home(): return {"message":"RE:KNOWLEDGE backend is running!","status":"online"}
@app.get("/health")
def health(): return {"status":"healthy","application":"RE:KNOWLEDGE","version":"2.0.0"}

@app.post("/auth/register")
def register(data:AuthInput,db:Session=Depends(get_db)):
    email=data.email.lower().strip()
    if len(data.password)<10: raise HTTPException(400,"Password must contain at least 10 characters.")
    if db.query(User).filter_by(email=email).first(): raise HTTPException(409,"An account with this email already exists.")
    workspace=data.workspace_code.strip() if data.workspace_code else str(uuid.uuid4())
    if data.workspace_code and not db.query(User).filter_by(workspace_id=workspace).first():
        raise HTTPException(400,"Workspace code not found. Ask a workspace member for the exact code.")
    user=User(email=email,name=(data.name or email.split("@")[0])[:120],password_hash=pw_hash(data.password),workspace_id=workspace)
    db.add(user); db.commit(); db.refresh(user)
    return {"token":make_token(user),"user":{"id":user.id,"email":user.email,"name":user.name,"workspace_id":user.workspace_id}}
@app.post("/auth/login")
def login(data:AuthInput,db:Session=Depends(get_db)):
    user=db.query(User).filter_by(email=data.email.lower().strip()).first()
    if not user or not verify_pw(data.password,user.password_hash): raise HTTPException(401,"Email or password is incorrect.")
    return {"token":make_token(user),"user":{"id":user.id,"email":user.email,"name":user.name,"workspace_id":user.workspace_id}}
@app.get("/auth/me")
def me(user:User=Depends(current_user)):
    return {"id":user.id,"email":user.email,"name":user.name,"workspace_id":user.workspace_id}

@app.get("/projects")
def list_projects(db:Session=Depends(get_db),user:User=Depends(current_user)):
    if db.query(Project).filter_by(workspace_id=user.workspace_id).count()==0:
        for name,description in [("Student Career Agent","AI-powered career guidance and resume platform"),("Disaster Response System","Edge AI early warning and rescue network"),("Research Knowledge Base","Research papers and scientific documentation")]:
            db.add(Project(workspace_id=user.workspace_id,name=name,description=description))
        db.commit()
    return [{"id":p.id,"name":p.name,"description":p.description,"files":db.query(KnowledgeDocument).filter_by(project_id=p.id).count(),"created_at":p.created_at.isoformat()} for p in db.query(Project).filter_by(workspace_id=user.workspace_id).order_by(Project.created_at).all()]
@app.post("/projects")
def create_project(data:ProjectInput,db:Session=Depends(get_db),user:User=Depends(current_user)):
    name=data.name.strip()
    if not name: raise HTTPException(400,"Project name is required.")
    if db.query(Project).filter_by(workspace_id=user.workspace_id,name=name).first(): raise HTTPException(409,"Project already exists.")
    p=Project(workspace_id=user.workspace_id,name=name,description=data.description); db.add(p); db.commit(); db.refresh(p)
    return {"id":p.id,"name":p.name,"description":p.description,"files":0}

def extract(filename,raw):
    ext=filename.rsplit(".",1)[-1].lower() if "." in filename else ""
    if ext not in {"pdf","docx","txt","md"}: raise HTTPException(400,"Only PDF, DOCX, TXT and MD files are supported.")
    if len(raw)>10*1024*1024: raise HTTPException(413,"Maximum file size is 10 MB.")
    try:
        if ext=="pdf":
            pdf=PdfReader(BytesIO(raw))
            if pdf.is_encrypted: raise HTTPException(400,"Password-protected PDFs are not supported.")
            content="\n".join(page.extract_text() or "" for page in pdf.pages)
        elif ext=="docx":
            doc=Document(BytesIO(raw)); content="\n".join([p.text for p in doc.paragraphs]+[" | ".join(c.text for c in row.cells) for t in doc.tables for row in t.rows])
        else: content=raw.decode("utf-8-sig")
    except HTTPException: raise
    except Exception as e: raise HTTPException(400,f"Document extraction failed: {e}")
    if not content.strip(): raise HTTPException(400,"No readable text found in this document.")
    return content

def create_embedding(text):
    key=os.getenv("OPENAI_API_KEY")
    if not key: return None
    payload={"model":os.getenv("OPENAI_EMBEDDING_MODEL","text-embedding-3-small"),"input":text[:8000]}
    req=Request("https://api.openai.com/v1/embeddings",data=json.dumps(payload).encode(),headers={"Authorization":f"Bearer {key}","Content-Type":"application/json"})
    with urlopen(req,timeout=30) as response:
        return json.loads(response.read())["data"][0]["embedding"]

def cosine(a,b):
    dot=sum(x*y for x,y in zip(a,b)); na=math.sqrt(sum(x*x for x in a)); nb=math.sqrt(sum(y*y for y in b))
    return dot/(na*nb) if na and nb else 0.0

@app.post("/upload")
async def upload_document(file:UploadFile=File(...),project_name:str=Form(...),db:Session=Depends(get_db),user:User=Depends(current_user)):
    filename=file.filename or "uploaded_file"; raw=await file.read(10*1024*1024+1); content=extract(filename,raw)
    p=project_for(db,user,project_name,create=True)
    doc=KnowledgeDocument(workspace_id=user.workspace_id,project_id=p.id,filename=filename,content=content,word_count=len(content.split()),uploaded_by=user.id)
    db.add(doc); db.commit(); db.refresh(doc)
    for index, chunk in enumerate(chunks(content)):
        vector=None
        try: vector=create_embedding(chunk)
        except Exception: vector=None
        db.add(KnowledgeChunk(document_id=doc.id,chunk_index=index,content=chunk,embedding=json.dumps(vector) if vector else None))
    db.commit()
    return {"id":doc.id,"filename":filename,"project_name":p.name,"content":content,"word_count":doc.word_count,"status":"stored"}

@app.get("/documents")
def documents(project_name:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
    p=project_for(db,user,project_name)
    return [{"id":d.id,"filename":d.filename,"word_count":d.word_count,"created_at":d.created_at.isoformat(),"uploaded_by":d.uploaded_by} for d in db.query(KnowledgeDocument).filter_by(project_id=p.id).order_by(KnowledgeDocument.created_at.desc()).all()]

@app.post("/analyze")
def analyze(data:dict,db:Session=Depends(get_db),user:User=Depends(current_user)):
    content=(data.get("content") or "").strip(); name=data.get("project_name","Untitled")
    if not content: raise HTTPException(400,"Please provide project knowledge to analyze.")
    p=project_for(db,user,name,create=True)
    lower=content.lower()
    def hits(words,label): return [label] if any(w in lower for w in words) else []
    decisions=hits(["decision","decided","approved","selected"],"Potential project decision identified.") or ["No explicit decisions detected."]
    blockers=hits(["blocked","blocker","waiting","delayed"],"Potential project blocker identified.") or ["No explicit blockers detected."]
    risks=hits(["risk","issue","problem","concern"],"Potential project risk identified.") or ["No explicit risks detected."]
    return {"project_name":name,"summary":f"Analyzed {len(content.split())} words.","decisions":decisions,"blockers":blockers,"risks":risks,"status":"analysis_complete"}

def chunks(text, size=850, overlap=120):
    words=text.split()
    return [" ".join(words[i:i+size]) for i in range(0,len(words),size-overlap)]

def retrieve(question, docs):
    q=set(re.findall(r"[a-z0-9]{3,}",question.lower()))
    synonyms={"database":{"postgresql","postgres","mysql","sqlite","mongodb","database","db"},"db":{"postgresql","postgres","mysql","sqlite","mongodb","database"},"authentication":{"auth","login","identity"},"owner":{"assigned","responsible","assignee"},"decision":{"decided","selected","approved"},"dependency":{"depends","requires","integration"}}
    q_expanded=set(q)
    for term in q: q_expanded.update(synonyms.get(term,set()))
    q=q_expanded
    ranked=[]
    for doc in docs:
        for idx,chunk in enumerate(chunks(doc.content)):
            words=set(re.findall(r"[a-z0-9]{3,}",chunk.lower()))
            if not words: continue
            score=len(q&words)/max(1,math.sqrt(len(q)*len(words)))
            if score>0: ranked.append((score,doc,idx,chunk))
    return sorted(ranked,key=lambda x:x[0],reverse=True)[:5]

@app.post("/ask")
def ask(data:AskInput,db:Session=Depends(get_db),user:User=Depends(current_user)):
    p=project_for(db,user,data.project_name)
    docs=db.query(KnowledgeDocument).filter_by(project_id=p.id).all()
    if not docs: return {"answer":"I don't have any documents for this project yet. Upload project knowledge first.","confidence":"insufficient","sources":[]}
    matches=retrieve(data.question,docs)
    query_vector=None
    try: query_vector=create_embedding(data.question)
    except Exception: query_vector=None
    if query_vector:
        semantic=[]
        for chunk in db.query(KnowledgeChunk).join(KnowledgeDocument,KnowledgeChunk.document_id==KnowledgeDocument.id).filter(KnowledgeDocument.project_id==p.id).all():
            if chunk.embedding:
                doc=next((d for d in docs if d.id==chunk.document_id),None)
                if doc:
                    semantic.append((cosine(query_vector,json.loads(chunk.embedding)),doc,chunk.chunk_index,chunk.content))
        if semantic: matches=sorted(semantic,key=lambda x:x[0],reverse=True)[:5]
    if not matches or matches[0][0]<0.035:
        return {"answer":"The available project documents do not contain enough relevant information to answer this confidently. Please add a source document or clarify the question.","confidence":"insufficient","sources":[]}
    context="\n\n".join(f"[{m[1].filename}, section {m[2]+1}]\n{m[3]}" for m in matches)
    answer=None
    key=os.getenv("OPENAI_API_KEY")
    if key:
        try:
            payload={"model":os.getenv("OPENAI_MODEL","gpt-4o-mini"),"temperature":0.1,"messages":[{"role":"system","content":"Answer only from the supplied project context. If it does not support an answer, say so. Cite sources using [filename]."},{"role":"user","content":f"Question: {data.question}\n\nProject context:\n{context}"}]}
            req=Request("https://api.openai.com/v1/chat/completions",data=json.dumps(payload).encode(),headers={"Authorization":f"Bearer {key}","Content-Type":"application/json"})
            with urlopen(req,timeout=25) as r: answer=json.loads(r.read())["choices"][0]["message"]["content"]
        except Exception: answer=None
    if not answer:
        answer="The most relevant information I found is:\n\n"+"\n\n".join(m[3][:900] for m in matches[:3])
    return {"answer":answer,"confidence":"grounded","sources":[{"document":m[1].filename,"section":m[2]+1,"relevance":round(m[0],3)} for m in matches]}

def save_decision_revision(db,d,user_id):
    snapshot={"title":d.title,"detail":d.detail,"owner":d.owner,"status":d.status,"dependencies":json.loads(d.dependencies or "[]"),"version":d.version}
    db.add(DecisionRevision(decision_id=d.id,version=d.version,snapshot=json.dumps(snapshot),changed_by=user_id))

@app.get("/decisions")
def list_decisions(project_name:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
    p=project_for(db,user,project_name)
    return [{"id":d.id,"title":d.title,"detail":d.detail,"owner":d.owner,"status":d.status,"dependencies":json.loads(d.dependencies or "[]"),"version":d.version,"created_at":d.created_at.isoformat()} for d in db.query(Decision).filter_by(project_id=p.id).order_by(Decision.created_at.desc()).all()]
@app.post("/decisions")
def add_decision(data:DecisionInput,db:Session=Depends(get_db),user:User=Depends(current_user)):
    p=project_for(db,user,data.project_name)
    d=Decision(workspace_id=user.workspace_id,project_id=p.id,title=data.title,detail=data.detail,owner=data.owner,status=data.status,dependencies=json.dumps(data.dependencies),created_by=user.id)
    db.add(d); db.commit(); db.refresh(d); save_decision_revision(db,d,user.id); db.commit()
    return {"id":d.id,"title":d.title,"detail":d.detail,"owner":d.owner,"status":d.status,"dependencies":data.dependencies,"version":d.version}
@app.patch("/decisions/{decision_id}")
def update_decision(decision_id:int,data:dict,db:Session=Depends(get_db),user:User=Depends(current_user)):
    d=db.query(Decision).filter_by(id=decision_id,workspace_id=user.workspace_id).first()
    if not d: raise HTTPException(404,"Decision not found.")
    if "status" in data: d.status=str(data["status"])[:40]
    if "owner" in data: d.owner=str(data["owner"])[:160]
    if "dependencies" in data: d.dependencies=json.dumps(data["dependencies"] if isinstance(data["dependencies"],list) else [])
    d.version+=1; save_decision_revision(db,d,user.id); db.commit()
    return {"id":d.id,"status":d.status,"owner":d.owner,"dependencies":json.loads(d.dependencies or "[]"),"version":d.version}

@app.get("/decisions/{decision_id}/history")
def decision_history(decision_id:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
    d=db.query(Decision).filter_by(id=decision_id,workspace_id=user.workspace_id).first()
    if not d: raise HTTPException(404,"Decision not found.")
    return [{"version":r.version,"snapshot":json.loads(r.snapshot),"changed_at":r.created_at.isoformat()} for r in db.query(DecisionRevision).filter_by(decision_id=d.id).order_by(DecisionRevision.version.desc()).all()]

@app.post("/handovers")
def create_handover(data:HandoverInput,db:Session=Depends(get_db),user:User=Depends(current_user)):
    p=project_for(db,user,data.project_name)
    docs=db.query(KnowledgeDocument).filter_by(project_id=p.id).all()
    decisions=db.query(Decision).filter_by(project_id=p.id).all()
    prior=db.query(Handover).filter_by(project_id=p.id).count()
    report={"project":p.name,"version":prior+1,"generated_at":datetime.utcnow().isoformat()+"Z","knowledge_sources":[{"filename":d.filename,"words":d.word_count} for d in docs],"decisions":[{"title":d.title,"detail":d.detail,"owner":d.owner,"status":d.status,"dependencies":json.loads(d.dependencies or "[]"),"version":d.version} for d in decisions],"unresolved_items":[{"title":d.title,"owner":d.owner} for d in decisions if d.status.lower() not in ("done","closed","resolved")],"dependencies":[{"decision":d.title,"items":json.loads(d.dependencies or "[]")} for d in decisions if json.loads(d.dependencies or "[]")]}
    h=Handover(workspace_id=user.workspace_id,project_id=p.id,version=prior+1,title=data.title,report=json.dumps(report,indent=2),receiving_team=data.receiving_team,created_by=user.id)
    db.add(h); db.commit(); db.refresh(h)
    return {"id":h.id,"version":h.version,"title":h.title,"report":report,"acknowledged":False}
@app.get("/handovers")
def list_handovers(project_name:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
    p=project_for(db,user,project_name)
    return [{"id":h.id,"version":h.version,"title":h.title,"receiving_team":h.receiving_team,"acknowledged":h.acknowledged,"acknowledged_by":h.acknowledged_by,"created_at":h.created_at.isoformat(),"report":json.loads(h.report)} for h in db.query(Handover).filter_by(project_id=p.id).order_by(Handover.version.desc()).all()]
@app.post("/handovers/{handover_id}/acknowledge")
def acknowledge(handover_id:int,data:dict,db:Session=Depends(get_db),user:User=Depends(current_user)):
    h=db.query(Handover).filter_by(id=handover_id,workspace_id=user.workspace_id).first()
    if not h: raise HTTPException(404,"Handover not found.")
    h.acknowledged=True; h.acknowledged_by=str(data.get("name") or user.name)[:180]; h.acknowledged_at=datetime.utcnow(); db.commit()
    return {"id":h.id,"acknowledged":True,"acknowledged_by":h.acknowledged_by,"acknowledged_at":h.acknowledged_at.isoformat()}
