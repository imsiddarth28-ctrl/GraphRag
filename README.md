# GraphRAG System

A production-ready Graph-based Retrieval-Augmented Generation (GraphRAG) system built with Clean Architecture. It integrates structured graph data from **Neo4j** and dense vector embeddings from **Qdrant** to deliver context-rich, semantic answers.

## Architecture

This project strictly follows **Clean Architecture** principles and **SOLID** design patterns:

```
                  ┌──────────────────────────────┐
                  │      API / CLI (Interfaces)   │
                  └──────────────┬───────────────┘
                                 │ Uses
                  ┌──────────────▼───────────────┐
                  │    Services (Application)    │
                  └──────────────┬───────────────┘
                                 │ Orchestrates
                  ┌──────────────▼───────────────┐
                  │    Contracts (Domain)        │
                  └──────────────┬───────────────┘
                                 │ Implements
                  ┌──────────────▼───────────────┐
                  │  DB / Drivers (Infrastructure)│
                  └──────────────────────────────┘
```

- **Domain Layer**: Contains pure business objects (`Document`, `Chunk`, `Entity`, `Relationship`, `Community`) and repo/service interfaces. No external dependencies.
- **Application Layer**: Coordinates parsing, chunking, graph community building, and retrieval flows.
- **Infrastructure Layer**: Connects to external services (Neo4j, Qdrant, OpenAI, Gemini) and manages connection lifecycle.
- **Interface Layer**: FastAPI endpoints and CLI tools for ingestion and search.

## Tech Stack

- **Backend**: Python 3.12, FastAPI, Uvicorn, Pydantic v2 (Settings & Validation), Asyncio.
- **Databases**: Neo4j (Graph DB), Qdrant (Vector DB).
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, TailwindCSS, shadcn/ui.
- **Orchestration**: Docker, Docker Compose.

---

## Folder Structure

```
.
├── backend/
│   ├── app/
│   │   ├── api/          # Route controllers and endpoints
│   │   ├── config/       # Pydantic Settings configuration
│   │   ├── core/         # Logger, dependency providers, errors
│   │   ├── models/       # Domain objects
│   │   ├── schemas/      # Request/Response validation schemas
│   │   ├── services/     # Business logic coordinators
│   │   ├── repositories/ # Repository Pattern adapters
│   │   ├── graph/        # Neo4j connections and builders
│   │   ├── retrieval/    # Qdrant connection and vector search
│   │   ├── embeddings/   # Dense vector embedding APIs
│   │   ├── llm/          # Large Language Model providers
│   │   ├── loaders/      # Document loading (PDF, text)
│   │   ├── chunking/     # Slide-window text chunkers
│   │   ├── prompts/      # System prompt templates
│   │   └── utils/        # Generic helpers
│   ├── requirements/     # Dependency requirements
│   └── tests/            # pytest test suite
│
├── frontend/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # Reusable layout and UI elements
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Client utility code
│   ├── services/         # API HTTP fetch services
│   └── types/            # TypeScript models
│
├── docker/               # App Dockerfiles
├── docs/                 # Documentation and ADRs
└── scripts/              # Setup and administration scripts
```

---

## Installation & Setup

### Prerequisites

- Python 3.12+
- Node.js 20+
- Docker & Docker Compose (optional but recommended)

### 1. Environment Configuration

Copy the example environment configuration file to `.env` and fill in the required API keys:
```bash
cp .env.example .env
```

### 2. Local Setup (Development)

#### Backend
1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   ```
2. Install dependencies:
   ```bash
   pip install -r backend/requirements/requirements.txt
   ```
3. Run the development server:
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```
   Backend will be available at `http://localhost:8000`.

#### Frontend
1. Install node dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Run development server:
   ```bash
   npm run dev
   ```
   Frontend will be available at `http://localhost:3000`.

### 3. Docker Compose (Production/Orchestrated)

To start the entire stack (FastAPI Backend, Next.js Frontend, Neo4j, Qdrant) in Docker containers:
```bash
docker compose up --build -d
```

- **FastAPI**: `http://localhost:8000`
- **Next.js**: `http://localhost:3000`
- **Neo4j Browser**: `http://localhost:7474`
- **Qdrant Dashboard**: `http://localhost:6333/dashboard`

---

## Testing

Run the backend test suite:
```bash
cd backend
pytest tests/ -v
```
