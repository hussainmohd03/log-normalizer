import asyncio
import json
import time
import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.models.model_loader import model_manager
from app.utils.prompt_builder import build_prompt
from app.utils.ocsf_parser import extract_json
from app.scoring.confidence import compute_confidence
from app.ocsf.validator import validate_ocsf
from app.postprocess import PostProcessor
from app.schemas.request import NormalizeRequest, ValidateRequest
from app.schemas.response import NormalizeResponse

logger = logging.getLogger(__name__)
router = APIRouter()

_INFERENCE_TIMEOUT_SECONDS = 600
_post_processor = PostProcessor()


def _parse_raw_dict(raw_log) -> dict:
    if isinstance(raw_log, dict):
        return raw_log
    try:
        parsed = json.loads(raw_log)
        if isinstance(parsed, dict):
            return parsed
        return {"raw": raw_log}
    except (json.JSONDecodeError, ValueError, TypeError):
        return {"raw": raw_log}


def _sync_normalize(req: NormalizeRequest) -> NormalizeResponse:
    start_time = time.time()
    try:
        prompt = build_prompt(req.raw_log, req.source, req.format, examples=None)
        raw_output = model_manager.generate(prompt)
        ocsf = extract_json(raw_output)

        if ocsf is None:
            processing_time_ms = int((time.time() - start_time) * 1000)
            return NormalizeResponse(
                ocsf=ocsf,
                decision="reject",
                confidence=0.0,
                processing_time_ms=processing_time_ms,
                error="JSON extraction failed",
            )

        raw_dict = _parse_raw_dict(req.raw_log)

        post_result = _post_processor.process(ocsf, raw_dict, req.source)

        validation = validate_ocsf(post_result.cleaned_ocsf, source=req.source)
        clean_ocsf = validation.cleaned if validation.valid else post_result.cleaned_ocsf

        scoring = compute_confidence(
            raw_dict, clean_ocsf, req.source,
            validation_errors=validation.errors,
            validation_warnings=validation.warnings,
            hallucinations_stripped=post_result.hallucinations_stripped,
        )
        processing_time_ms = int((time.time() - start_time) * 1000)

        logger.info(
            "source=%s confidence=%.3f decision=%s time_ms=%d fixes=%d hallucinations=%d",
            req.source, scoring.score, scoring.decision, processing_time_ms,
            len(post_result.fixes_applied), len(post_result.hallucinations_stripped),
        )

        return NormalizeResponse(
            ocsf=clean_ocsf,
            decision=scoring.decision,
            confidence=scoring.score,
            processing_time_ms=processing_time_ms,
            breakdown=scoring.breakdown,
            validation_errors=scoring.validation_errors if scoring.validation_errors else None,
            fixes_applied=post_result.fixes_applied,
            hallucinations_stripped=post_result.hallucinations_stripped,
        )

    except Exception as err:
        processing_time_ms = int((time.time() - start_time) * 1000)
        logger.error("Normalize error: %s", err, exc_info=True)
        return NormalizeResponse(
            ocsf=None,
            decision="reject",
            confidence=0.0,
            processing_time_ms=processing_time_ms,
            error=str(err),
        )


@router.post("/normalize", response_model=NormalizeResponse)
async def normalize(req: NormalizeRequest):
    if not model_manager.is_ready:
        return JSONResponse(status_code=503, content={"error": "Model loading, try again"})

    loop = asyncio.get_event_loop()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(None, _sync_normalize, req),
            timeout=_INFERENCE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error("Normalize timed out after %ds", _INFERENCE_TIMEOUT_SECONDS)
        return JSONResponse(
            status_code=504,
            content={"error": f"inference timeout after {_INFERENCE_TIMEOUT_SECONDS}s"},
        )


@router.post("/validate")
def validate(request: ValidateRequest):
    result = validate_ocsf(request.ocsf)
    return {"valid": result.valid, "errors": result.errors}
