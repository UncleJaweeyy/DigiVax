import os
from functools import lru_cache
from typing import List, Optional

import numpy as np
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer


MODEL_NAME = os.getenv("BIOBERT_MODEL", "pritamdeka/S-BioBert-snli-multinli-stsb")
API_KEY = os.getenv("BIOBERT_API_KEY", "").strip()
MAX_TEXT_LENGTH = int(os.getenv("BIOBERT_MAX_TEXT_LENGTH", "6000"))

app = FastAPI(title="DigiVax BioBERT Semantic Search")


class EmbedRequest(BaseModel):
    text: str = Field(..., min_length=1)


class EmbedResponse(BaseModel):
    embedding: List[float]
    model: str
    dimension: int


class RankRecord(BaseModel):
    id: str
    text: Optional[str] = ""
    embedding: Optional[List[float]] = None


class RankRequest(BaseModel):
    query: str = Field(..., min_length=1)
    records: List[RankRecord]


class RankResult(BaseModel):
    id: str
    score: float


class RankResponse(BaseModel):
    results: List[RankResult]
    model: str


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/embed", response_model=EmbedResponse)
def embed(
    request: EmbedRequest,
    x_biobert_api_key: Optional[str] = Header(default=None),
    x_api_key: Optional[str] = Header(default=None),
):
    assert_api_key(x_biobert_api_key or x_api_key)
    vector = encode_text(request.text)

    return {
        "embedding": vector.tolist(),
        "model": MODEL_NAME,
        "dimension": int(vector.shape[0]),
    }


@app.post("/rank", response_model=RankResponse)
def rank(
    request: RankRequest,
    x_biobert_api_key: Optional[str] = Header(default=None),
    x_api_key: Optional[str] = Header(default=None),
):
    assert_api_key(x_biobert_api_key or x_api_key)

    if not request.records:
        return {"results": [], "model": MODEL_NAME}

    query_vector = encode_text(request.query)
    results: list[RankResult] = []

    texts_to_embed = []
    text_record_indexes = []
    record_vectors: list[np.ndarray | None] = []

    for record in request.records:
        vector = normalize_existing_embedding(record.embedding)
        record_vectors.append(vector)

        if vector is None:
            texts_to_embed.append(record.text or "")
            text_record_indexes.append(len(record_vectors) - 1)

    if texts_to_embed:
        embedded = encode_texts(texts_to_embed)
        for vector_index, record_index in enumerate(text_record_indexes):
            record_vectors[record_index] = embedded[vector_index]

    for record, record_vector in zip(request.records, record_vectors):
        if record_vector is None:
            continue

        score = float(np.dot(query_vector, record_vector))
        if score > 0:
            results.append(RankResult(id=record.id, score=round(score, 6)))

    results.sort(key=lambda result: result.score, reverse=True)

    return {"results": results, "model": MODEL_NAME}


@lru_cache(maxsize=1)
def get_model():
    return SentenceTransformer(MODEL_NAME)


def encode_text(text: str):
    return encode_texts([text])[0]


def encode_texts(texts: list[str]):
    cleaned_texts = [clean_text(text) for text in texts]
    embeddings = get_model().encode(
        cleaned_texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )

    return np.asarray(embeddings, dtype=np.float32)


def normalize_existing_embedding(embedding: Optional[list[float]]):
    if not embedding:
        return None

    vector = np.asarray(embedding, dtype=np.float32)
    norm = np.linalg.norm(vector)

    if not np.isfinite(norm) or norm == 0:
        return None

    return vector / norm


def clean_text(text: str):
    return " ".join(str(text or "").split())[:MAX_TEXT_LENGTH]


def assert_api_key(api_key: Optional[str]):
    if API_KEY and api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid BioBERT API key.")
