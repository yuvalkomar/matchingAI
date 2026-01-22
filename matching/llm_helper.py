"""
LLM-powered matching decision maker.
Uses Google Gemini API. Heuristics find candidates, LLM makes final decision with explanation.
"""

import os
import json
import logging
from typing import Dict, Optional, Tuple, List
from dotenv import load_dotenv
import concurrent.futures

# Set up logging
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()


def is_llm_configured() -> bool:
    """Check if LLM API key is configured."""
    return bool(os.environ.get('GEMINI_API_KEY'))


def get_gemini_model():
    """Get configured Gemini model."""
    import google.generativeai as genai
    
    genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))
    return genai.GenerativeModel('gemini-2.5-flash')


def normalize_vendor_name(vendor: str) -> Tuple[str, bool]:
    """
    Use LLM to normalize a vendor name.
    
    Args:
        vendor: Raw vendor name (e.g., "AMZN MKTP US*123")
    
    Returns:
        (normalized_name, success)
        If LLM fails, returns original vendor name.
    """
    if not is_llm_configured():
        return vendor, False
    
    try:
        model = get_gemini_model()
        
        prompt = f"""You are a vendor name normalizer. Given a raw vendor name from a bank statement or receipt, return the canonical company name.

Return ONLY a JSON object with this structure:
{{"normalized_name": "Company Name", "confidence": 0.9}}

Examples:
- "AMZN MKTP US*123" -> {{"normalized_name": "Amazon", "confidence": 0.95}}
- "STARBUCKS #12345" -> {{"normalized_name": "Starbucks", "confidence": 0.99}}
- "MSFT *OFFICE365" -> {{"normalized_name": "Microsoft", "confidence": 0.95}}

Normalize this vendor name: {vendor}"""

        response = model.generate_content(prompt)
        
        # Extract JSON from response
        response_text = response.text.strip()
        # Handle potential markdown code blocks
        if response_text.startswith('```'):
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
        response_text = response_text.strip()
        
        result = json.loads(response_text)
        return result.get('normalized_name', vendor), True
        
    except Exception as e:
        # Log error but don't fail - return original
        logger.warning(f"LLM vendor normalization failed: {str(e)}")
        return vendor, False


def compute_semantic_similarity(desc1: str, desc2: str) -> Tuple[float, bool]:
    """
    Use LLM to compute semantic similarity between descriptions.
    
    Args:
        desc1: First description
        desc2: Second description
    
    Returns:
        (similarity_score, success)
        If LLM fails, returns 0.0.
    """
    if not is_llm_configured():
        return 0.0, False
    
    try:
        model = get_gemini_model()
        
        prompt = f"""You compare transaction descriptions for semantic similarity.

Return ONLY a JSON object with this structure:
{{"similarity": 0.85, "reasoning": "Brief explanation"}}

The similarity should be between 0.0 (completely different) and 1.0 (same transaction).
Consider:
- Same merchant/vendor
- Same type of purchase
- Similar amounts/quantities mentioned
- Same category of expense

Compare these transaction descriptions:
Description 1: {desc1}
Description 2: {desc2}"""

        response = model.generate_content(prompt)
        
        # Extract JSON from response
        response_text = response.text.strip()
        if response_text.startswith('```'):
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
        response_text = response_text.strip()
        
        result = json.loads(response_text)
        return result.get('similarity', 0.0), True
        
    except Exception as e:
        # Log error but don't fail
        logger.warning(f"LLM semantic similarity failed: {str(e)}")
        return 0.0, False


def enhance_match_explanation(
    ledger_txn: Dict,
    bank_txn: Dict,
    base_explanations: list
) -> Tuple[list, bool]:
    """
    Use LLM to add additional context to match explanations.
    Does NOT decide if something is a match - only adds context.
    
    Args:
        ledger_txn: Ledger transaction
        bank_txn: Bank transaction
        base_explanations: Existing heuristic explanations
    
    Returns:
        (enhanced_explanations, success)
    """
    if not is_llm_configured():
        return base_explanations, False
    
    try:
        model = get_gemini_model()
        
        prompt = f"""You provide additional context for transaction matching.

Given two transactions and existing match explanations, provide ONE brief additional insight.
Do NOT decide if they match - just provide context like:
- Known vendor name variations
- Common transaction patterns
- Industry knowledge

Return ONLY a JSON object:
{{"insight": "Brief insight text", "has_insight": true}}

If no additional insight, return:
{{"insight": "", "has_insight": false}}

Ledger: {ledger_txn['vendor']} - {ledger_txn['description']} (${ledger_txn['amount']})
Bank: {bank_txn['vendor']} - {bank_txn['description']} (${bank_txn['amount']})
Existing explanations: {base_explanations}"""

        response = model.generate_content(prompt)
        
        # Extract JSON from response
        response_text = response.text.strip()
        if response_text.startswith('```'):
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
        response_text = response_text.strip()
        
        result = json.loads(response_text)
        
        if result.get('has_insight') and result.get('insight'):
            enhanced = base_explanations.copy()
            enhanced.append(f"🤖 {result['insight']}")
            return enhanced, True
        
        return base_explanations, True
        
    except Exception as e:
        logger.warning(f"LLM explanation enhancement failed: {str(e)}")
        return base_explanations, False


def auto_match_columns(columns: list, sample_data: dict, timeout: int = 10) -> Tuple[Dict[str, str], bool]:
    """
    Use LLM to automatically match columns to categories based on column names and sample data.
    
    Args:
        columns: List of column names from the uploaded file
        sample_data: Dict mapping column names to list of first 3 row values
        timeout: Maximum time to wait for LLM response in seconds (default: 10)
    
    Returns:
        (mapping_dict, success)
        mapping_dict maps category names to column names
    """
    # Load env vars again in case they weren't loaded yet
    load_dotenv()
    
    # Check if API key exists (don't require use_llm toggle for this feature)
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        return {}, False
    
    try:
        import google.generativeai as genai
        import signal
        
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        # Build sample data string
        sample_str = ""
        for col in columns:
            values = sample_data.get(col, [])
            sample_str += f"\n- Column '{col}': {values[:3]}"
        
        prompt = f"""You are a data column classifier for financial transaction files. 
Analyze the column names and sample data to determine which column matches each category.

Categories to match:
- date: Transaction date (look for dates, timestamps)
- vendor: Merchant/vendor name (company names, store names)
- description: Transaction description (narrative, memo, details)
- amount: Single amount column (monetary values, could be positive/negative)
- money_in: Credits/deposits column (incoming money only)
- money_out: Debits/payments column (outgoing money only)
- reference: Reference number, invoice ID, check number
- category: Expense category, transaction type/classification

Columns available:{sample_str}

Return ONLY a JSON object mapping category to column name. 
Use null if no matching column exists.
If you see separate debit/credit columns, use money_in and money_out instead of amount.

Example response:
{{"date": "Transaction Date", "vendor": "Merchant Name", "description": "Details", "amount": "Amount", "money_in": null, "money_out": null, "reference": "Ref #", "category": "Category"}}

Analyze and match:"""

        # Use timeout for the API call
        def call_llm():
            return model.generate_content(prompt)
        
        # Use ThreadPoolExecutor with timeout
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(call_llm)
            try:
                response = future.result(timeout=timeout)
            except concurrent.futures.TimeoutError:
                logger.warning(f"AI column matching timed out after {timeout} seconds")
                return {}, False
        
        # Extract JSON from response
        response_text = response.text.strip()
        if response_text.startswith('```'):
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
        response_text = response_text.strip()
        
        result = json.loads(response_text)
        
        # Validate that matched columns actually exist
        valid_mapping = {}
        for category, col_name in result.items():
            if col_name and col_name in columns:
                valid_mapping[category] = col_name
            else:
                valid_mapping[category] = None
        
        return valid_mapping, True
        
    except json.JSONDecodeError as e:
        # JSON parsing failed
        logger.warning("AI column matching: Invalid response format")
        return {}, False
    except concurrent.futures.TimeoutError:
        # Timeout occurred (caught in inner try/except, but also here as backup)
        logger.warning(f"AI column matching timed out after {timeout} seconds")
        return {}, False
    except Exception as e:
        # Other errors
        logger.warning(f"AI column matching unavailable: {str(e)}")
        return {}, False


def select_best_match(ledger_txn: Dict, candidates: List, heuristic_scores: Dict) -> Tuple[Optional[int], str, float]:
    """
    Use LLM to select the best match from heuristic candidates and provide explanation.
    
    This is the core matching decision function. Heuristics provide candidates with scores,
    then LLM makes the final decision and provides a natural language explanation.
    
    Args:
        ledger_txn: The ledger transaction to match
        candidates: List of MatchCandidate objects from heuristics (top candidates)
        heuristic_scores: Dict with heuristic configuration used
    
    Returns:
        (selected_index, explanation, confidence)
        - selected_index: Index of chosen candidate (0-based), or None if no good match
        - explanation: Natural language explanation for the decision
        - confidence: Confidence score 0-1
    """
    if not is_llm_configured():
        # Fallback: return top candidate if score is good enough
        if candidates and candidates[0].score >= 0.5:
            return 0, "Best heuristic match selected (LLM unavailable)", candidates[0].score
        return None, "No confident match found (LLM unavailable)", 0.0
    
    if not candidates:
        return None, "No candidates to evaluate", 0.0
    
    try:
        model = get_gemini_model()
        
        # Build candidate descriptions for LLM
        candidates_desc = []
        for i, c in enumerate(candidates[:5]):  # Max 5 candidates
            desc = f"""
Candidate {i+1}:
  - Bank Vendor: {c.bank_txn['vendor']}
  - Bank Description: {c.bank_txn['description']}
  - Bank Amount: ${c.bank_txn['amount']:.2f}
  - Bank Date: {c.bank_txn['date']}
  - Bank Type: {c.bank_txn.get('txn_type', 'unknown')}
  - Heuristic Score: {c.score:.2f}
  - Heuristic Confidence: {c.confidence}
  - Component Scores: Amount={c.component_scores.get('amount',0):.2f}, Date={c.component_scores.get('date',0):.2f}, Vendor={c.component_scores.get('vendor',0):.2f}
"""
            candidates_desc.append(desc)
        
        prompt = f"""You are a financial transaction matching expert. Your job is to decide if a company ledger entry matches any of the bank transaction candidates.

LEDGER ENTRY TO MATCH:
- Vendor: {ledger_txn['vendor']}
- Description: {ledger_txn['description']}
- Amount: ${ledger_txn['amount']:.2f}
- Date: {ledger_txn['date']}
- Type: {ledger_txn.get('txn_type', 'unknown')}
- Reference: {ledger_txn.get('reference', 'N/A')}

BANK TRANSACTION CANDIDATES (ranked by heuristic score):
{"".join(candidates_desc)}

MATCHING RULES CONTEXT:
- Amount tolerance: ${heuristic_scores.get('amount_tolerance', 0.01)}
- Date window: {heuristic_scores.get('date_window', 3)} days
- Vendor similarity threshold: {heuristic_scores.get('vendor_threshold', 0.8)*100:.0f}%

YOUR TASK:
1. Analyze the ledger entry and all candidates
2. Consider: Are the amounts compatible? Are the dates reasonable? Could the vendors be the same entity (accounting for abbreviations, different naming conventions)?
3. Select the BEST match, or indicate NO MATCH if none are suitable

Return ONLY a JSON object:
{{
    "selected_candidate": 1,  // 1-based index, or null if no match
    "confidence": 0.85,  // 0.0 to 1.0
    "explanation": "Clear explanation in 1-2 sentences why this is (or isn't) a match. Mention specific details that support your decision.",
    "reasoning": {{
        "amount_match": "exact/close/different",
        "date_match": "same day/within window/outside window", 
        "vendor_match": "same/likely same/different"
    }}
}}

Be conservative - only match if you're reasonably confident. It's better to flag for human review than make a wrong match."""

        response = model.generate_content(prompt)
        
        # Extract JSON from response
        response_text = response.text.strip()
        if response_text.startswith('```'):
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
        response_text = response_text.strip()
        
        result = json.loads(response_text)
        
        selected = result.get('selected_candidate')
        confidence = float(result.get('confidence', 0.5))
        explanation = result.get('explanation', 'No explanation provided')
        
        # Convert 1-based to 0-based index
        if selected is not None and selected > 0:
            selected_idx = selected - 1
            if selected_idx < len(candidates):
                # Blend LLM confidence with heuristic score
                heuristic_score = candidates[selected_idx].score
                blended_confidence = (confidence * 0.6) + (heuristic_score * 0.4)
                return selected_idx, explanation, blended_confidence
        
        return None, explanation, confidence
        
    except Exception as e:
        # Fallback to heuristic-only decision
        if candidates and candidates[0].score >= 0.6:
            return 0, f"Best heuristic match (LLM error: {str(e)})", candidates[0].score
        return None, f"No confident match (LLM error: {str(e)})", 0.0


def evaluate_match_batch(ledger_transactions: List[Dict], bank_transactions: List[Dict], 
                         engine, progress_callback=None) -> List[Dict]:
    """
    Evaluate all ledger transactions against bank transactions using heuristics + LLM.
    
    Args:
        ledger_transactions: List of normalized ledger transactions
        bank_transactions: List of normalized bank transactions
        engine: MatchingEngine instance for heuristics
        progress_callback: Optional callback(current, total) for progress updates
    
    Returns:
        List of match results with LLM decisions and explanations
    """
    results = []
    matched_bank_ids = set()
    total = len(ledger_transactions)
    
    for i, ledger_txn in enumerate(ledger_transactions):
        if progress_callback:
            progress_callback(i + 1, total)
        
        # Step 1: Heuristics find top candidates
        candidates = engine.find_candidates(
            ledger_txn, 
            bank_transactions, 
            matched_bank_ids,
            top_k=5
        )
        
        if not candidates:
            results.append({
                'ledger_txn': ledger_txn,
                'bank_txn': None,
                'selected_candidate': None,
                'candidates': [],
                'llm_explanation': "No candidates found by heuristics",
                'confidence': 0.0,
                'heuristic_score': 0.0,
            })
            continue
        
        # Step 2: LLM selects best match and explains
        selected_idx, explanation, confidence = select_best_match(
            ledger_txn, 
            candidates,
            engine.get_config()
        )
        
        if selected_idx is not None:
            selected = candidates[selected_idx]
            matched_bank_ids.add(selected.bank_txn['id'])
            
            results.append({
                'ledger_txn': ledger_txn,
                'bank_txn': selected.bank_txn,
                'selected_candidate': selected,
                'candidates': candidates,
                'llm_explanation': explanation,
                'confidence': confidence,
                'heuristic_score': selected.score,
                'component_scores': selected.component_scores,
            })
        else:
            results.append({
                'ledger_txn': ledger_txn,
                'bank_txn': None,
                'selected_candidate': None,
                'candidates': candidates,
                'llm_explanation': explanation,
                'confidence': confidence,
                'heuristic_score': candidates[0].score if candidates else 0.0,
            })
    
    # Sort by confidence (highest first for review)
    results.sort(key=lambda r: r['confidence'], reverse=True)
    
    return results
