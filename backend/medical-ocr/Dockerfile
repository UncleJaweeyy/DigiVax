# ─────────────────────────────────────────────────────────────────────────
# Dockerfile — PP-OCRv5 Medical Form OCR Service
# Uses PaddlePaddle 3.2.0 because the exported model is PIR-format.
# ─────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim

# ── system deps ────────────────────────────────────────────────────────────
# These are essential for OpenCV and image processing in Linux
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libsm6 libxext6 libxrender-dev \
        wget curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── workdir ────────────────────────────────────────────────────────────────
WORKDIR /app

# ── Python dependencies ────────────────────────────────────────────────────
COPY requirements.txt .
# Ensure we upgrade pip first to handle modern wheel installs
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir paddlepaddle==3.2.0 \
        -i https://www.paddlepaddle.org.cn/packages/stable/cpu/ && \
    pip install --no-cache-dir -r requirements.txt

# ── application code ───────────────────────────────────────────────────────
COPY ocr_engine.py    ./ocr_engine.py
COPY api_server.py    ./api_server.py
COPY cli_infer.py     ./cli_infer.py

# ── model artefacts ────────────────────────────────────────────────────────
COPY model/   ./model/

# ── environment ────────────────────────────────────────────────────────────
ENV MODEL_DIR=/app/model \
    DICT_PATH=/app/model/custom_dict.txt \
    LOG_LEVEL=INFO \
    MAX_FILE_MB=20 \
    MEDICAL_OCR_PIPELINE=paddleocr \
    PADDLEOCR_DET_MODEL=PP-OCRv5_server_det \
    PADDLEOCR_REC_MODEL=PP-OCRv5_server_rec \
    DISABLE_MODEL_SOURCE_CHECK=True \
    FLAGS_use_mkldnn=0 \
    FLAGS_enable_pir_api=0 \
    PORT=8080

# ── health-check ───────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# ── entrypoint ─────────────────────────────────────────────────────────────
# Uses Gunicorn with Uvicorn workers for production-grade performance
CMD exec gunicorn api_server:app \
        -k uvicorn.workers.UvicornWorker \
        -w 1 \
        -b "0.0.0.0:${PORT}" \
        --timeout 120 \
        --access-logfile - \
        --error-logfile -
