"""
FastAPI main application.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from backend.api.routes import import_route, matching, exceptions, export

app = FastAPI(
    title="Transaction Reconciliation API",
    description="API for matching company ledger transactions with bank transactions",
    version="1.0.0"
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite default ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(import_route.router)
app.include_router(matching.router)
app.include_router(exceptions.router)
app.include_router(export.router)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Transaction Reconciliation API",
        "version": "1.0.0",
        "endpoints": {
            "import": "/api/import",
            "matching": "/api/match",
            "exceptions": "/api/exceptions",
            "export": "/api/export",
        }
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/api/test")
async def test():
    """Simple test endpoint."""
    return {"message": "API is working", "timestamp": __import__("datetime").datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
