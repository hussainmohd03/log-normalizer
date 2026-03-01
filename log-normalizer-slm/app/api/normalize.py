from fastapi import APIRouter, HTTPException, Response
from app.models.model_loader import model_manager
from app.utils.prompt_builder import build_prompt 
from app.utils.ocsf_parser import extract_json 
from app.utils.confidence_scorer import score_confidence
from app.schemas.request import NormalizeRequest
from app.schemas.response import NormalizeResponse

import time
import logging
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/normalize", response_model=NormalizeResponse)
def normalize(req: NormalizeRequest):
    if not model_manager.is_ready: 
        raise HTTPException(status_code=503, detail="Model loading, try again")
    start_time = time.time()
    
    try: 

        prompt = build_prompt(req.raw_log, req.source, req.format, examples=None)
        raw_output = model_manager.generate(prompt)
        ocsf = extract_json(raw_output)

        if ocsf is None:
            processing_time_ms = int((time.time() - start_time) * 1000)
            return NormalizeResponse(
                ocsf={},
                confidence=0.0,
                processing_time_ms=processing_time_ms,
                error="JSON extraction failed",
            )
        
        confidence = score_confidence(ocsf)
        processing_time_ms = int((time.time() - start_time) * 1000)

        logger.info(f"source={req.source} confidence={confidence} time_ms={processing_time_ms}")
        return NormalizeResponse(
            ocsf=ocsf,
            confidence=confidence,
            processing_time_ms=processing_time_ms,
        )

    except Exception as err: 
        raise HTTPException(status_code=500, detail=f"Internal error")


