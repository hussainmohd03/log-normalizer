import logging
from app.config import settings


def setup_logger():
    logging.basicConfig(
        level=settings.log_level,
        format="%(levelname)s:     %(asctime)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )