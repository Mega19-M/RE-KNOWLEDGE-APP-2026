# RE:KNOWLEDGE — Knowledge Continuity & Intelligent Handover

This update preserves the existing React/Vite dashboard design and FastAPI service, while adding persistent team workflows.

## Included improvements

1. **Persistent team knowledge**
   - Email/password registration and sign-in.
   - Passwords are PBKDF2-SHA256 hashed; API sessions are signed and expire after seven days.
   - Workspace-isolated projects, uploaded PDF/DOCX/TXT/MD documents, decisions and handover records.
   - PostgreSQL is supported through `DATABASE_URL`; SQLite is used for local development only.

2. **Knowledge assistant (RAG)**
   - Uploaded documents are split into overlapping text chunks and indexed.
   - With `OPENAI_API_KEY`, document and question embeddings use `text-embedding-3-small` for semantic retrieval, and answers use `gpt-4o-mini` (both model names can be configured).
   - Without the key, retrieval falls back to local keyword matching and extractive answers. The assistant returns an explicit insufficient-evidence response when retrieval is weak.
   - Answers include supporting filenames and section references.

3. **Decision and handover tracking**
   - Decision/issue records with owner, status and revision counter.
   - Versioned handover reports with knowledge source inventory and unresolved items.
   - Receiving-team acknowledgement is saved with the acknowledging person's name and timestamp.

## Deploy the updated backend to Render

Keep the existing Render service and its URL. In its settings:

- **Root Directory:** `backend`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`

Set these environment variables in Render:

- `DATABASE_URL` — attach a Render PostgreSQL database and copy its **Internal Database URL**. This is required for persistence across deploys/restarts; the default SQLite file is only for local development.
- `JWT_SECRET` — a long, random secret (at least 32 random bytes). Keep it private and stable between deploys.
- `CORS_ORIGINS` — `https://re-knowledge-app-2026.vercel.app`
- `OPENAI_API_KEY` — optional, enables semantic embeddings and generated RAG answers.
- `OPENAI_MODEL` — optional, defaults to `gpt-4o-mini`.
- `OPENAI_EMBEDDING_MODEL` — optional, defaults to `text-embedding-3-small`.

Deploy the service and check `/health`.

## Deploy the updated frontend to Vercel

Keep the existing Vercel project and domain. Confirm:

- **Root Directory:** `frontend`
- **Framework:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

Add this environment variable in Vercel:

- `VITE_BACKEND_URL` = `https://re-knowledge-app-2026.onrender.com`

Redeploy the existing Vercel project. Do not create a new project or change the domain.

## Team setup

1. Open the existing Vercel site and choose **Create account**.
2. The first member creates a workspace. Sign in and copy the workspace ID shown in the account/workspace settings (or ask the admin to share it).
3. Teammates register using that workspace code to join the same private workspace.
4. Upload project documents, add decisions/issues, ask the assistant, and generate a handover report.
5. The receiving team signs in and acknowledges the handover.

## Important production notes

- Configure Render PostgreSQL before real team use. Local SQLite and Render's temporary filesystem are not durable storage.
- Never commit `.env` files or API secrets.
- Restrict `CORS_ORIGINS` to the exact frontend domain.
- The assistant is only as reliable as the uploaded source material. It cites sources and reports when evidence is insufficient; review important answers before acting.
- Existing projects shown as sample dashboard content are not automatically migrated into the database. Create them in the signed-in workspace and upload the source documents again if they need to become persistent records.
