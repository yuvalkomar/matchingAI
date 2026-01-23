# Transaction Reconciliation App

A modern, user-friendly web application for reconciling company ledger transactions with bank transactions using AI-powered matching.

## Features

- **Four-Step Workflow**: Import → Review → Exceptions → Export
- **AI-Powered Matching**: Advanced matching algorithms with transparent explanations
- **User Control**: Human approves every match - no automatic confirmations
- **Full Audit Trail**: Complete history of all decisions and configurations
- **Modern UI**: Beautiful, intuitive interface designed for non-technical users

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS (Vite)
- **Backend**: FastAPI (Python)
- **Matching Engine**: Heuristic-based with optional LLM assistance

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- GEMINI_API_KEY (optional, for AI features)

### Backend Setup

```bash
# Install Python dependencies
pip install -r requirements.txt

# Set up environment variables (optional, for AI features)
echo "GEMINI_API_KEY=your-api-key-here" > .env

# Run the backend server (from project root)
python -m uvicorn backend.api.main:app --reload --port 8000
```

The backend will be available at `http://localhost:8000`

### Frontend Setup

```bash
# Install Node dependencies
cd frontend
npm install

# Run the development server
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Usage

1. **Import**: Upload your company ledger and bank transaction files (CSV or Excel)
2. **Map Columns**: Use AI suggestions or manually map columns
3. **Review**: Review AI-suggested matches one by one
4. **Exceptions**: Handle unmatched transactions
5. **Export**: Download results and audit trail

## API Documentation

Once the backend is running, visit `http://localhost:8000/docs` for interactive API documentation.

## Demo Data

Demo CSV files are included in the `data/` folder:
- `data/demo_ledger.csv` - Sample company ledger transactions
- `data/demo_bank.csv` - Sample bank transactions

## Matching Logic

The heuristic matching engine computes a score (0-1) from these components:

| Component | Weight | Description |
|-----------|--------|-------------|
| Amount Match | 35% | Exact match or within tolerance |
| Date Proximity | 25% | Days between transactions |
| Vendor Similarity | 30% | RapidFuzz string similarity |
| Reference Match | 5% | Optional exact reference match |
| Transaction Type | 5% | Money in vs money out |

### Confidence Levels

- **High** (≥0.85): Strong match, likely correct
- **Medium** (0.65-0.84): Possible match, review carefully
- **Low** (<0.65): Weak match, probably not a match

## LLM Integration

LLM assistance is **optional** and used for:
- Vendor name normalization (e.g., "AMZN" → "Amazon")
- Automatic column mapping
- Enhanced match explanations

### Enable LLM

1. **Install the Google GenAI SDK:**
   ```bash
   pip install google-genai
   ```
   Note: If you have the old `google-generativeai` package, uninstall it first:
   ```bash
   pip uninstall google-generativeai -y
   ```

2. Get your API key from: https://makersuite.google.com/app/apikey

3. Add it to the `.env` file:
   ```
   GEMINI_API_KEY=your-api-key-here
   ```

4. The app will automatically use AI features when available

## Development

### Project Structure

```
project/
├── backend/
│   ├── api/
│   │   ├── main.py          # FastAPI application
│   │   ├── routes/           # API route handlers
│   │   └── models.py         # Pydantic models
│   └── matching/             # Matching engine (unchanged)
├── frontend/
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Page components
│   │   ├── services/         # API client
│   │   └── types/            # TypeScript types
│   └── package.json
└── data/                      # Demo data files
```

## License

MIT License - Built for educational purposes.
