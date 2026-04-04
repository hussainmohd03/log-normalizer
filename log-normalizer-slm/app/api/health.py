import os
import time
import psutil
import torch

from fastapi import APIRouter, Response
from app.models.model_loader import model_manager
from app.config import settings

router = APIRouter()



START_TIME = time.time()

def get_system_metrics() -> dict:
    mem = psutil.virtual_memory()
    metrics = {
        "memory_used_mb": round(mem.used / 1024 / 1024),
        "memory_total_mb": round(mem.total / 1024 / 1024),
        "memory_percent": mem.percent,
        "cpu_percent": psutil.cpu_percent(interval=0.1),
        "cpu_cores": psutil.cpu_count(),
        "uptime_seconds": int(time.time() - START_TIME),
    }

    
    if torch.cuda.is_available():
        free, total = torch.cuda.mem_get_info()
        used = total - free
        metrics["gpu_memory_used_mb"] = round(used / 1024 / 1024)
        metrics["gpu_memory_total_mb"] = round(total / 1024 / 1024)
        metrics["gpu_memory_percent"] = round((used / total) * 100)
        try:
            metrics["gpu_utilization_percent"] = torch.cuda.utilization()
        except Exception:
            metrics["gpu_utilization_percent"] = None

    return metrics


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
        "model_path": settings.base_model_path,
        "system": get_system_metrics()
    }