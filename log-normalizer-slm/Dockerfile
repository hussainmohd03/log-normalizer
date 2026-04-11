

FROM nvidia/cuda:13.0.0-runtime-ubuntu22.04


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

RUN ln -sf /usr/bin/python3.11 /usr/local/bin/python \
 && ln -sf /usr/bin/python3.11 /usr/local/bin/python3

WORKDIR /app


COPY requirements.txt ./
RUN python -m pip install --no-cache-dir --upgrade pip \
 && python -m pip install --no-cache-dir -r requirements.txt


COPY app ./app


ENV HF_HOME=/cache/huggingface \
    TRANSFORMERS_CACHE=/cache/huggingface/transformers \
    PYTHONUNBUFFERED=1

EXPOSE 8000


CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
