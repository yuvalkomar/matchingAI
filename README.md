# Transaction Reconciliation Web App

A semi-automatic transaction reconciliation tool that helps bookkeepers match company ledger transactions with bank transactions. The system uses transparent heuristics and optional LLM assistance, while keeping the human fully in control.

## Philosophy

🔍 **If there's a choice between smarter automation and clearer user understanding — always choose clarity.**

This tool is designed with the following principles:

- **Transparency First**: Every match suggestion includes a clear explanation of why it was suggested
- **Human in Control**: No auto-matching without user approval
- **Explainable AI**: All LLM outputs are JSON and explainable. No opaque decisions.
- **Uncertainty Visibility**: All uncertainty must be visible in the UI

## Tech Stack

- **Frontend**: React + TypeScript + TailwindCSS (via Vite)
- **Backend**: Python + FastAPI, with Pandas for data handling
- **AI**: Deterministic heuristics first, LLMs used only for:
  - Vendor name normalization
  - Description semantic similarity

## Project Structure

```
/backend
  main.py              # FastAPI application
  models.py            # Pydantic data models
  matching/
    heuristics.py      # Core matching heuristics
    scorer.py          # Composite scoring engine
    explain.py         # Explanation generation
  llm/
    vendor_normalization.py    # LLM vendor name normalization
    description_similarity.py  # LLM semantic similarity

/frontend
  src/
    pages/             # Page components
    components/        # Reusable UI components
    api/              # API client
    types/            # TypeScript type definitions
```

## Features

- **Step-by-step file import**: Upload ledger and bank transaction files
- **Side-by-side match review**: Review suggested matches with explanations
- **Transparent match logic**: See exactly why each match was suggested
- **Exceptions dashboard**: Review unmatched transactions
- **Exportable audit report**: Generate reconciliation reports

## Development Status

This project is being built incrementally. Current status:

✅ **STEP 1** — Project Skeleton (Complete)
- Created folder and file structure
- Set up backend FastAPI skeleton
- Set up frontend React + TypeScript + TailwindCSS skeleton
- Created README with system intent

▶️ **Next Steps**:
- STEP 2: Define backend data models and CSV import
- STEP 3: Implement heuristic scoring (with explanation output)
- STEP 4: Add LLM-based normalization modules
- STEP 5: Build API endpoints for upload, matching, and report export
- STEP 6-9: Frontend flows — Import UI, Match Review, Exceptions Dashboard, Audit Export

## Getting Started

### Backend Setup

```bash
cd backend
pip install -r ../requirements.txt
uvicorn main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

Create a `.env` file in the project root:

```
GEMINI_API_KEY=your_api_key_here
```

The LLM features are optional and will gracefully degrade if the API key is not configured.

## License

MIT

