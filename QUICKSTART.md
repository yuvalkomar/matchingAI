# Quick Start Guide

## Prerequisites

- Python 3.8+ installed
- Node.js 18+ and npm installed

> **⚠️ If you get "npm: command not found"**, Node.js is not installed. See [INSTALL_NODE.md](INSTALL_NODE.md) for installation instructions.

## Step 1: Backend Setup

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Start the FastAPI server:**
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

   The backend will run on `http://localhost:8000`
   
   You can verify it's working by visiting: `http://localhost:8000` or `http://localhost:8000/docs` (FastAPI auto-generated docs)

## Step 2: Frontend Setup

1. **Open a new terminal window** (keep the backend running)

2. **Install Node.js dependencies:**
   ```bash
   cd frontend
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

   The frontend will run on `http://localhost:5173` (Vite default port)

## Step 3: View the UI

Open your browser and navigate to:
```
http://localhost:5173
```

You should see the Transaction Reconciliation home page.

## Optional: LLM Features

If you want to enable LLM features (vendor normalization, semantic similarity):

1. Create a `.env` file in the project root:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

2. The system will work without this, but LLM features will be disabled.

## Troubleshooting

- **Backend won't start**: Make sure port 8000 is not in use
- **Frontend won't start**: Make sure port 5173 is not in use
- **CORS errors**: Check that the backend is running and CORS is configured correctly
- **Module not found**: Run `npm install` in the frontend directory

