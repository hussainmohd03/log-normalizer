import copy
import logging
from typing import Any

from app.postprocess.result import PostProcessResult
from app.postprocess.rules.enrichment import run_enrichment_rules
from app.postprocess.rules.field_fixes import run_field_fix_rules
from app.postprocess.rules.hallucinations import run_hallucination_rules
from app.postprocess.rules.mitre import run_mitre_rules
from app.postprocess.rules.structural import run_structural_rules


logger = logging.getLogger(__name__)


class PostProcessor:
    def process(
        self,
        ocsf: dict[str, Any],
        raw_alert: dict[str, Any],
        source: str,
    ) -> PostProcessResult:
        cleaned = copy.deepcopy(ocsf)
        result = PostProcessResult(cleaned_ocsf=cleaned)

        result.absorb(run_structural_rules(cleaned))
        result.absorb(run_field_fix_rules(cleaned))
        result.absorb(run_enrichment_rules(cleaned, raw_alert, source))
        result.absorb(run_mitre_rules(cleaned))
        result.absorb(run_hallucination_rules(cleaned, raw_alert))

        if result.fixes_applied or result.hallucinations_stripped:
            logger.info(
                "postprocess: %d fixes, %d hallucinations stripped",
                len(result.fixes_applied),
                len(result.hallucinations_stripped),
            )

        return result
