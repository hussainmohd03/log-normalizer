import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.logger import setup_logger
from app.api import normalize, health
from app.models.model_loader import model_manager


setup_logger()


async def _load_model_background():
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, model_manager.load)


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(_load_model_background())
    yield


app = FastAPI(title="LogNormalizer SLM Service", version="1.0.0", lifespan=lifespan)
app.include_router(normalize.router, prefix="/api")
app.include_router(health.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
