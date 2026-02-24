"""
produce a float 0.0–1.0 representing output quality. This score drives routing: below settings.confidence_threshold → manual review queue.
"""
def score_confidence(ocsf: dict) -> float:
    pass