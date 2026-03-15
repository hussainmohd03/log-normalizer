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
from app.schemas.request import NormalizeRequest, ValidateRequest
from app.schemas.response import NormalizeResponse

logger = logging.getLogger(__name__)
router = APIRouter()

_gpu_semaphore = asyncio.Semaphore(1)


def _sync_normalize(req: NormalizeRequest) -> NormalizeResponse:
    start_time = time.time()
    try:
        prompt = build_prompt(req.raw_log, req.source, req.format, examples=None)
        raw_output = model_manager.generate(prompt)
        ocsf = extract_json(raw_output)

        if ocsf is None:
            processing_time_ms = int((time.time() - start_time) * 1000)
            return NormalizeResponse(
                ocsf={},
                decision="reject",
                confidence=0.0,
                processing_time_ms=processing_time_ms,
                error="JSON extraction failed",
            )

        # Validate and get clean Pydantic-serialized output [P8]
        validation = validate_ocsf(ocsf, source=req.source)
        clean_ocsf = validation.model.model_dump(exclude_none=True) if validation.model else ocsf

        # Parse raw_log to dict for consistency scoring
        try:
            raw_dict = json.loads(req.raw_log)
            if not isinstance(raw_dict, dict):
                raw_dict = {"raw": req.raw_log}
        except (json.JSONDecodeError, ValueError):
            raw_dict = {"raw": req.raw_log}

        result = compute_confidence(raw_dict, clean_ocsf, req.source)
        processing_time_ms = int((time.time() - start_time) * 1000)

        logger.info(
            "source=%s confidence=%.3f decision=%s time_ms=%d",
            req.source, result.score, result.decision, processing_time_ms,
        )

        return NormalizeResponse(
            ocsf=clean_ocsf,
            decision=result.decision,
            confidence=result.score,
            processing_time_ms=processing_time_ms,
            breakdown=result.breakdown,
            errors=validation.errors if not validation.valid else None,
        )

    except Exception as err:
        processing_time_ms = int((time.time() - start_time) * 1000)
        logger.error("Normalize error: %s", err, exc_info=True)
        return NormalizeResponse(
            ocsf={},
            decision="reject",
            confidence=0.0,
            processing_time_ms=processing_time_ms,
            error=str(err),
        )


@router.post("/normalize", response_model=NormalizeResponse)
async def normalize(req: NormalizeRequest):
    if not model_manager.is_ready:
        return JSONResponse(status_code=503, content={"error": "Model loading, try again"})

    if _gpu_semaphore.locked():
        return JSONResponse(status_code=503, content={"error": "GPU busy"})

    async with _gpu_semaphore:
        result = await asyncio.get_event_loop().run_in_executor(None, _sync_normalize, req)
        return result


@router.post("/validate")
def validate(request: ValidateRequest):
    result = validate_ocsf(request.ocsf)
    return {"valid": result.valid, "errors": result.errors}
