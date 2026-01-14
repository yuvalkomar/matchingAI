"""
Explanation generation for match results.
Provides human-readable explanations of matching decisions.
"""

from typing import Dict, List


def format_match_explanation(
    candidate: Dict,
    include_component_scores: bool = True
) -> str:
    """
    Format a match candidate into a human-readable explanation.
    
    Args:
        candidate: Match candidate dict with score, explanations, component_scores
        include_component_scores: Whether to include detailed component scores
    
    Returns:
        Formatted explanation string
    """
    lines = []
    
    # Overall score and confidence
    score = candidate.get('score', 0.0)
    confidence = candidate.get('confidence', 'Low')
    lines.append(f"Match Score: {score:.2%} ({confidence} confidence)")
    
    # Component scores breakdown
    if include_component_scores:
        component_scores = candidate.get('component_scores', {})
        if component_scores:
            lines.append("\nComponent Scores:")
            for component, score_val in component_scores.items():
                lines.append(f"  • {component.capitalize()}: {score_val:.2%}")
    
    # Explanations
    explanations = candidate.get('explanations', [])
    if explanations:
        lines.append("\nMatch Details:")
        for exp in explanations:
            lines.append(f"  • {exp}")
    
    return "\n".join(lines)


def generate_summary_report(
    match_results: List[Dict],
    total_ledger: int,
    total_bank: int
) -> Dict:
    """
    Generate a summary report of matching results.
    
    Args:
        match_results: List of match result dicts
        total_ledger: Total number of ledger transactions
        total_bank: Total number of bank transactions
    
    Returns:
        Summary dict with statistics
    """
    matched_count = sum(1 for r in match_results if r.get('bank_txn') is not None)
    high_confidence = sum(1 for r in match_results if r.get('confidence', 0) >= 0.85)
    medium_confidence = sum(1 for r in match_results if 0.65 <= r.get('confidence', 0) < 0.85)
    low_confidence = sum(1 for r in match_results if r.get('confidence', 0) < 0.65)
    
    return {
        'total_ledger_transactions': total_ledger,
        'total_bank_transactions': total_bank,
        'matched_count': matched_count,
        'unmatched_count': total_ledger - matched_count,
        'match_rate': matched_count / total_ledger if total_ledger > 0 else 0.0,
        'confidence_breakdown': {
            'high': high_confidence,
            'medium': medium_confidence,
            'low': low_confidence
        }
    }

