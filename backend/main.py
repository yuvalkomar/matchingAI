"""
FastAPI backend for transaction reconciliation web app.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Transaction Reconciliation API",
    description="Semi-automatic transaction reconciliation with transparent heuristics and optional LLM assistance",
    version="0.1.0"
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite default ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"message": "Transaction Reconciliation API", "status": "running"}


# API endpoints will be added in subsequent steps
# - /upload/ledger
# - /upload/bank
# - /match
# - /export

