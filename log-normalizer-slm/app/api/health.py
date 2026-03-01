from fastapi import APIRouter, Response
from app.models.model_loader import model_manager
from app.config import settings

router = APIRouter()

@router.get('/health')
async def health(res: Response):
    status = "loading"
    is_loaded = False

    if model_manager.load_error:
        status = "unhealthy"
        res.status_code = 503
    elif model_manager.is_ready: 
        status = "healthy"
        is_loaded = True

    return {
        "status": status, 
        "model_loaded": is_loaded,
        "model_path": settings.base_model_path
    }