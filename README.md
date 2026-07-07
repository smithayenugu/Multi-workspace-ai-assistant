# Multi-Workspace Document Assistant

A full-stack AI-powered document assistant that lets users create isolated **workspaces**, upload documents (PDF, DOCX, XLSX, CSV, TXT), and chat with an AI over the content of those documents using retrieval-augmented generation.

**Live Demo:** [https://multi-workspace-ai-assistant.vercel.app](https://multi-workspace-ai-assistant.vercel.app)
**Backend API:** [https://multi-workspace-ai-assistant.onrender.com](https://multi-workspace-ai-assistant.onrender.com)
**Repository:** [github.com/smithayenugu/Multi-workspace-ai-assistant](https://github.com/smithayenugu/Multi-workspace-ai-assistant)

---

## Overview

This project lets a user organize their documents into separate workspaces (e.g. by project, subject, or client), upload files, and ask natural-language questions about them. The backend extracts text from the uploaded files, splits it into chunks, generates vector embeddings for each chunk, and stores them for semantic retrieval so the AI chat feature can answer questions grounded in the actual document content.

The system is built as two independently deployed services — a React frontend and a Node.js/Express API — communicating over a REST API, with PostgreSQL (via Supabase) as the data store and Supabase Storage for file storage.

## Features

- **Authentication** — user registration and login via Supabase Auth, with JWT-based session handling on the backend.
- **Workspaces** — users can create, view, update, and delete isolated workspaces, each with its own documents, chat history, and tasks.
- **Document upload & processing** — supports PDF, DOCX, XLSX, CSV/TSV, and TXT files. Each upload goes through a pipeline: text extraction → chunking (with paragraph/line-aware splitting and overlap) → embedding generation → storage in a vector database.
- **Duplicate detection** — documents are hashed (SHA-256 of extracted text) so re-uploading identical content within a workspace is detected and flagged instead of reprocessed.
- **AI chat over documents** — a chat interface that retrieves relevant document chunks and generates grounded answers, with citation support (`chatApi.getCitations`).
- **Task management** — basic per-workspace task tracking (create, update, delete).
- **Tool usage tracking** — logs and history for tool/function calls made during chat sessions.
- **Stuck-document recovery** — on server restart, documents left in a `processing` state are automatically re-downloaded from storage and reprocessed.
- **Rate limiting & security headers** — Helmet for HTTP security headers, `express-rate-limit` on API and auth routes to prevent abuse.

## Tech Stack

**Frontend**
- React 18 + Vite
- React Router
- Tailwind CSS
- Axios
- Supabase JS client (auth session handling)
- Deployed on **Vercel**

**Backend**
- Node.js + Express
- PostgreSQL (with `pgvector` for embedding storage), accessed via Supabase
- Supabase Storage for uploaded files
- JWT-based auth middleware
- `pdf-parse`, `mammoth`, `xlsx`, `csv-parse` for multi-format text extraction
- Helmet, CORS, `express-rate-limit` for security/hardening
- Deployed on **Render**

## Architecture

```
┌─────────────────┐        HTTPS/REST        ┌──────────────────────┐
│  React Frontend  │ ───────────────────────▶ │   Express Backend    │
│    (Vercel)      │ ◀─────────────────────── │      (Render)        │
└─────────────────┘                           └──────────┬───────────┘
                                                          │
                                        ┌─────────────────┼─────────────────┐
                                        ▼                 ▼                 ▼
                                 PostgreSQL DB      Supabase Storage   Embedding API
                                 (pgvector)          (file uploads)    (chunk vectors)
```

The frontend and backend are deployed as separate services and communicate purely over the API — the backend has no knowledge of how or where the frontend is hosted beyond a CORS allow-list.

## Document Processing Pipeline

1. File is uploaded and stored in Supabase Storage; a `documents` row is created with status `pending`.
2. Text is extracted based on file extension (PDF via `pdf-parse`, DOCX via `mammoth`, XLSX via `xlsx`, CSV/TSV via `csv-parse` with delimiter auto-detection, TXT read directly).
3. Content is hashed for duplicate detection within the workspace.
4. Text is split into overlapping chunks, preferring natural paragraph/line boundaries and falling back to hard character splitting for oversized blocks (useful for structured data like CSV rows).
5. Embeddings are generated per chunk and stored alongside the text in a `pgvector` column.
6. Document status is updated to `processed` (or `failed`, with the error message saved for debugging).

## Current Status / Known Limitations

Being upfront about where this stands:

- The core upload → extract → chunk → embed pipeline is implemented and working for PDF/DOCX/XLSX/CSV/TXT.
- I'm still actively debugging edge cases in the embedding/storage step for some documents — a few uploads have failed and I'm working through the root cause using the saved `error_message` field and server logs rather than guessing.
- There's no background job queue yet — processing currently runs inline after upload, which is fine at small scale but would need a proper queue (e.g. BullMQ) for production-scale usage.
- No automated test suite yet beyond a Jest setup scaffold — this is on my list to build out.
- No retry button in the UI yet for failed/pending documents; currently requires re-upload.

## Getting Started Locally

### Prerequisites
- Node.js 18+
- A Supabase project (Postgres + Storage + Auth)

### Backend
```bash
cd backend
npm install
# create a .env file with DATABASE_URL, SUPABASE keys, JWT secret, etc.
npm run dev
```

### Frontend
```bash
cd frontend
npm install
# create a .env file with VITE_API_URL pointing at your backend
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies `/api` requests to the backend at `http://localhost:5000` in development.

## API Overview

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Workspaces | `GET/POST /api/workspaces`, `GET/PUT/DELETE /api/workspaces/:id`, `GET /api/workspaces/:id/stats` |
| Documents | `POST /api/documents/upload`, `GET /api/documents`, `GET /api/documents/:id`, `GET /api/documents/:id/status`, `DELETE /api/documents/:id` |
| Chat | `POST /api/chat/message`, `GET /api/chat/history`, `GET /api/chat/messages/:id/citations` |
| Tasks | `GET/POST /api/tasks`, `PUT/DELETE /api/tasks/:id` |
| Tools | `GET /api/tools/definitions`, `GET /api/tools/history` |

## What I Learned Building This

- Structuring a multi-tenant-style app around "workspaces" and enforcing that isolation at the database and API level.
- Building a document-processing pipeline that handles multiple file formats with a consistent internal interface.
- Debugging real production deployment issues — build/start command separation, CORS configuration across two independently hosted services, and tracking down a runtime `ReferenceError` that only surfaced under actual usage.
- Working with vector embeddings and `pgvector` for semantic search over unstructured document content.

## Quick Evaluation Guide

To make evaluation easier, I've included a demo account with two preloaded workspaces and sample documents so you can immediately test document retrieval, workspace isolation, and AI tool calling without uploading any files.

### Demo Account

**Email:** `demouser@example.com`

**Password:** `demouser@123`

### Preloaded Workspaces

#### Workspace 1 — Discrete Mathematics

Contains:

- `DM UNIT-5..pdf`

Example questions:

- What is Graph Theory?
- What is the chromatic number of a complete graph?
- Explain the Four Color Theorem.
- What is a bipartite graph?
- What is the fundamental theorem of graph theory?
- What are the properties of planar graphs?
- How is an adjacency matrix different from an incidence matrix?
- What is the chromatic number of a tree?
- Explain complete bipartite graphs.
- What is the condition for a graph to be non-planar?

---

#### Workspace 2 — Green Valley University

Contains:

- `green_valley_student_handbook.pdf`

Example questions:

- What is the minimum attendance requirement?
- What is the passing percentage?
- How many books can a student borrow?
- When does the hostel gate close?
- Who is the Vice Chancellor?
- What is the scholarship amount?
- What is the name of the university research laboratory?
- When are visitors allowed in the hostel?
- What is the library return period?
- What is the student support email?

---

## Testing Workspace Isolation

One of the core requirements of this project is strict workspace isolation.

You can verify this using the preloaded workspaces.

### From the Discrete Mathematics workspace, ask:

- What is the hostel gate closing time?
- Who is the Vice Chancellor?
- What is Quantum Nest?

The assistant should **not** answer these questions because they belong to a different workspace.

### From the Green Valley University workspace, ask:

- What is Graph Theory?
- Explain the Four Color Theorem.
- What is the chromatic number of a complete graph?

The assistant should **not** answer these questions because they belong to the Discrete Mathematics workspace.

This demonstrates that retrieval is scoped to the currently active workspace and that documents from other workspaces are not accessible.

## Contact

**GitHub:** [@smithayenugu](https://github.com/smithayenugu)
