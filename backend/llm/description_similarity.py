"""
LLM-powered description semantic similarity.
Uses Google Gemini API to compute semantic similarity between transaction descriptions.
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
        import google.generativeai as genai
        
        genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))
        model = genai.GenerativeModel('gemini-2.5-flash')
        
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
        print(f"LLM semantic similarity failed: {str(e)}")
        return 0.0, False

