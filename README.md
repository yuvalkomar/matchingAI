# Transaction Reconciliation App

A human-in-the-loop Streamlit application for reconciling company ledger transactions with bank transactions using transparent heuristics and optional LLM assistance.

## Features

- **Four-Step Workflow**: Import → Review → Exceptions → Export
- **Transparent Heuristics**: All matching decisions include human-readable explanations
- **User Control**: No auto-confirmation; human approves every match
- **Optional LLM**: OpenAI integration for vendor normalization (behind toggle)
- **Full Audit Trail**: Every decision tracked with timestamps and rule configurations

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run the app
streamlit run app.py
```

## Demo Data

Demo CSV files are included in the `data/` folder:
- `data/demo_ledger.csv` - Sample company ledger transactions
- `data/demo_bank.csv` - Sample bank transactions

## Workflow

### 1. Import Data
- Upload company ledger (CSV/Excel)
- Upload bank transactions (CSV/Excel)
- Map columns to normalized schema
- Preview and validate data

### 2. Review Matches
- Review suggested matches one at a time
- Side-by-side comparison of ledger and bank entries
- See matching logic with explanations
- Actions: Match, Not a Match, Flag as Duplicate, Skip

### 3. Exceptions Dashboard
- View unmatched ledger transactions
- View unmatched bank transactions
- Adjust matching rules and re-run
- Search and filter exceptions

### 4. Export
- Download confirmed matches (CSV)
- Download unmatched ledger entries (CSV)
- Download unmatched bank entries (CSV)
- Download full audit trail (JSON)

## Matching Logic

The heuristic matching engine computes a score (0-1) from these components:

| Component | Weight | Description |
|-----------|--------|-------------|
| Amount Match | 40% | Exact match or within tolerance |
| Date Proximity | 25% | Days between transactions |
| Vendor Similarity | 30% | RapidFuzz string similarity |
| Reference Match | 5% | Optional exact reference match |

### Confidence Levels
- **High** (≥0.85): Strong match, likely correct
- **Medium** (0.65-0.84): Possible match, review carefully
- **Low** (<0.65): Weak match, probably not a match

### Explanation Examples
- "Exact amount match ($150.00)"
- "Amount difference $0.50 within tolerance"
- "Date difference: 1 day"
- "Vendor similarity: 92% ('Staples Inc' vs 'Staples')"
- "Reference match: INV-001"

## LLM Integration

LLM assistance is **optional** and used only for:
- Vendor name normalization (e.g., "AMZN" → "Amazon")
- Semantic similarity between descriptions

### Important Notes
- LLM is behind a user toggle (disabled by default)
- Requires `GEMINI_API_KEY` in `.env` file
- LLM **never** decides if something is a match
- Heuristics always dominate
- System works fully without LLM

### Enable LLM
1. Get your API key from: https://makersuite.google.com/app/apikey
2. Add it to the `.env` file:
```
GEMINI_API_KEY=your-api-key-here
```
3. Enable the LLM toggle in the sidebar

## Audit Trail

Every user decision is tracked with:
- Timestamp
- Action (match/reject/duplicate/skip)
- Ledger transaction ID
- Bank transaction ID (if applicable)
- Match score and confidence
- Explanation reasons
- Matching rule configuration at time of decision

## Architecture

```
matchingAI/
├── app.py                 # Main entry point
├── requirements.txt       # Dependencies
├── README.md             # This file
├── data/
│   ├── demo_ledger.csv   # Demo ledger data
│   └── demo_bank.csv     # Demo bank data
├── pages/
│   ├── __init__.py
│   ├── landing.py        # Landing page
│   ├── import_data.py    # Data import & mapping
│   ├── review_matches.py # Match review screen
│   ├── exceptions.py     # Exceptions dashboard
│   └── export.py         # Export & audit
└── matching/
    ├── __init__.py
    ├── engine.py         # Heuristic matching engine
    └── llm_helper.py     # Optional LLM integration
```

## License

MIT License - Built for educational purposes.
