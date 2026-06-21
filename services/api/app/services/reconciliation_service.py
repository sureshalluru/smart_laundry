"""
Reconciliation service — compares intake counts against fold counts
and detects discrepancies.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def compute_discrepancies(
    intake_items: list[dict],
    fold_items: list[dict],
) -> list[dict]:
    """
    Compare intake record items to fold record items and produce discrepancy entries
    for every category where counts differ.

    Args:
        intake_items: List of dicts with 'category' and 'count' from intake record
        fold_items: List of dicts with 'category' and 'count' from fold record

    Returns:
        List of discrepancy dicts with category, intakeCount, foldCount, difference, and severity.
        Empty list if all counts match.
    """
    # Build lookup maps
    intake_map = {item["category"]: item.get("count", 0) for item in intake_items}
    fold_map = {item["category"]: item.get("count", 0) for item in fold_items}

    # Get all unique categories across both records
    all_categories = set(intake_map.keys()) | set(fold_map.keys())

    discrepancies = []
    for category in all_categories:
        intake_count = intake_map.get(category, 0)
        fold_count = fold_map.get(category, 0)

        if intake_count != fold_count:
            difference = fold_count - intake_count
            severity = classify_severity(abs(difference))

            discrepancies.append({
                "category": category,
                "intakeCount": intake_count,
                "foldCount": fold_count,
                "difference": difference,
                "severity": severity,
            })

    return discrepancies


def classify_severity(absolute_difference: int) -> str:
    """
    Classify the severity of a discrepancy based on the absolute difference.

    Args:
        absolute_difference: Absolute value of the count difference

    Returns:
        "warning" for 1 item difference, "alert" for 2+ items
    """
    if absolute_difference == 0:
        return "none"
    elif absolute_difference == 1:
        return "warning"
    else:
        return "alert"


def validate_acknowledgements(
    discrepancies: list[dict],
    acknowledgements: list[dict],
) -> tuple[bool, list[dict]]:
    """
    Validate that all discrepancies have corresponding acknowledgements.

    Args:
        discrepancies: List of discrepancy dicts
        acknowledgements: List of acknowledgement dicts with 'category' and 'reason'

    Returns:
        Tuple of (all_resolved: bool, unresolved: list[dict])
    """
    acknowledged_categories = {ack["category"] for ack in acknowledgements}
    unresolved = [d for d in discrepancies if d["category"] not in acknowledged_categories]

    return len(unresolved) == 0, unresolved


def all_items_match(intake_items: list[dict], fold_items: list[dict]) -> bool:
    """
    Check if all intake and fold counts match perfectly.

    Args:
        intake_items: List of dicts with 'category' and 'count'
        fold_items: List of dicts with 'category' and 'count'

    Returns:
        True if all counts match, False otherwise
    """
    discrepancies = compute_discrepancies(intake_items, fold_items)
    return len(discrepancies) == 0
