# syntax=docker/dockerfile:1.7
#
# SLM service: Foundation-Sec-1.1-8B + LoRA, served via FastAPI.
#
# Requires NVIDIA GPU + nvidia-container-toolkit on the host. The
# torch wheels in requirements.txt are pinned to cu130, so the host
# must have CUDA 13 drivers installed (`nvidia-smi` should report a
# driver version that supports CUDA 13).
#
# The model weights are NOT baked into the image — too large (~16GB).
# They are mounted at runtime from ./log-normalizer-slm/models on the
# host (see docker-compose.yml).
#
# We use the official nvidia/cuda runtime image (not devel) because
# we don't compile any CUDA code at runtime — torch ships its own
# kernels. This saves ~3GB of image size.

FROM nvidia/cuda:13.0.0-runtime-ubuntu22.04

# Python 3.11 + tooling. The deadsnakes PPA gives us a modern Python
# without rebuilding from source.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      software-properties-common \
      ca-certificates \
      curl \
 && add-apt-repository -y ppa:deadsnakes/ppa \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      python3.11 \
      python3.11-venv \
      python3-pip \
 && rm -rf /var/lib/apt/lists/*

# Use Python 3.11 as the default `python` and `pip`.
RUN ln -sf /usr/bin/python3.11 /usr/local/bin/python \
 && ln -sf /usr/bin/python3.11 /usr/local/bin/python3

WORKDIR /app

# Install Python deps in a single layer. The torch wheels are huge
# (~3GB) so this layer is the slow one — caching it on top of the
# requirements file means rebuilds only happen when requirements
# actually change.
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir --upgrade pip \
 && python -m pip install --no-cache-dir -r requirements.txt

# Copy application source last so iterating on app code doesn't bust
# the deps layer.
COPY app ./app

# HuggingFace and transformers honor these env vars for cache location.
# Pointing them at /cache lets the compose volume persist downloads
# across container restarts.
ENV HF_HOME=/cache/huggingface \
    TRANSFORMERS_CACHE=/cache/huggingface/transformers \
    PYTHONUNBUFFERED=1

EXPOSE 8000

# uvicorn binds to 0.0.0.0 inside the container. Host networking is
# handled by docker-compose port mapping.
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
