"""
LLM-powered vendor name normalization.
Uses Google Gemini API to normalize vendor names.
"""

import os
import json
from typing import Tuple
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def is_llm_configured() -> bool:
    """Check if LLM API key is configured."""
    return bool(os.environ.get('GEMINI_API_KEY'))


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
        import google.generativeai as genai
        
        genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))
        model = genai.GenerativeModel('gemini-2.5-flash')
        
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
        print(f"LLM vendor normalization failed: {str(e)}")
        return vendor, False

