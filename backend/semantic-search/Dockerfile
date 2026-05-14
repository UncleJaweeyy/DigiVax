FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    BIOBERT_MODEL=pritamdeka/S-BioBert-snli-multinli-stsb

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py ./server.py

CMD exec gunicorn -k uvicorn.workers.UvicornWorker -w 1 -b 0.0.0.0:${PORT} server:app --timeout 300
