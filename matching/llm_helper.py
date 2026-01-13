"""
Optional LLM helper for vendor normalization and semantic similarity.
Uses Google Gemini API. LLM is used only for supportive tasks - heuristics always dominate.
"""

import os
import json
from typing import Dict, Optional, Tuple
import streamlit as st
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


def is_llm_available() -> bool:
    """Check if LLM is available (API key set and user enabled)."""
    return (
        st.session_state.get('use_llm', False) and
        os.environ.get('GEMINI_API_KEY')
    )


def get_gemini_model():
    """Get configured Gemini model."""
    import google.generativeai as genai
    
    genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))
    return genai.GenerativeModel('gemini-1.5-flash')


def normalize_vendor_name(vendor: str) -> Tuple[str, bool]:
    """
    Use LLM to normalize a vendor name.
    
    Args:
        vendor: Raw vendor name (e.g., "AMZN MKTP US*123")
    
    Returns:
        (normalized_name, success)
        If LLM fails, returns original vendor name.
    """
    if not is_llm_available():
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
        st.warning(f"LLM vendor normalization failed: {str(e)}")
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
    if not is_llm_available():
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
        st.warning(f"LLM semantic similarity failed: {str(e)}")
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
    if not is_llm_available():
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
        st.warning(f"LLM explanation enhancement failed: {str(e)}")
        return base_explanations, False
