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

✅ **STEP 2** — Backend Data Models and CSV Import (Complete)
- Defined Pydantic models for transactions and matches
- Implemented CSV parsing for both ledger and bank statement formats
- Handles date parsing with multiple format support
- Transaction type normalization

✅ **STEP 3** — Heuristic Scoring (Complete)
- Implemented transparent matching heuristics:
  - Amount matching (with tolerance)
  - Date proximity scoring
  - Vendor similarity (RapidFuzz)
  - Reference matching
  - Transaction type validation
- Composite scoring engine with weighted components
- Explanation generation for all match decisions

✅ **STEP 4** — LLM-Based Normalization (Complete)
- Vendor name normalization using Google Gemini
- Description semantic similarity computation
- Graceful degradation when LLM is not configured
- JSON-structured LLM outputs for explainability

✅ **STEP 5** — API Endpoints (Complete)
- `/upload/ledger` - Upload and parse ledger CSV
- `/upload/bank` - Upload and parse bank CSV
- `/match` - Run matching algorithm and return candidates
- `/match/confirm/{ledger_id}/{bank_id}` - Manually confirm a match
- `/match/reject/{ledger_id}` - Reject a match
- `/export` - Export reconciliation report as CSV
- `/status` - Get current reconciliation status

✅ **STEP 6-9** — Frontend Flows (Complete)
- **Import UI**: Step-by-step file upload with preview
- **Match Review**: Side-by-side comparison with transparent explanations
- **Exceptions Dashboard**: View and manage unmatched transactions
- **Audit Export**: Download reconciliation reports

The application is now fully functional and ready for use!

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

