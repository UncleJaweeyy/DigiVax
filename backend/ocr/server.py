from __future__ import annotations

import os
import secrets
import tempfile
from pathlib import Path
from typing import Any

# Cloud Run's CPU environment can crash Paddle's OneDNN/PIR path during OCR
# inference, so keep the runtime on Paddle's safer default CPU kernels.
os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("FLAGS_enable_pir_api", "0")
os.environ.setdefault("DISABLE_MODEL_SOURCE_CHECK", "True")

from fastapi import FastAPI, File, Header, HTTPException, UploadFile, status
from paddleocr import PaddleOCR

app = FastAPI(title="DigiVax PaddleOCR Demo API")

allowed_content_types = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "application/pdf",
}

ocr_engine: PaddleOCR | None = None


def get_ocr_engine() -> PaddleOCR:
    global ocr_engine

    if ocr_engine is None:
        # Use lightweight mobile OCR models for a Cloud Run friendly demo.
        ocr_engine = PaddleOCR(
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_recognition_model_name="en_PP-OCRv5_mobile_rec",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )

    return ocr_engine


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ocr")
async def run_ocr(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    assert_authorized(authorization)

    if file.content_type not in allowed_content_types:
        raise HTTPException(status_code=400, detail="Unsupported file format. Use JPG, PNG, or PDF.")

    suffix = Path(file.filename or "").suffix or ".png"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_path = temp_file.name
        temp_file.write(await file.read())

    try:
        result = get_ocr_engine().predict(temp_path)
        text_lines, scores = extract_text_lines(result)
        text = "\n".join(text_lines).strip()

        if not text:
            raise HTTPException(status_code=422, detail="PaddleOCR did not detect readable text.")

        return {
            "text": text,
            "confidence": average_score(scores),
            "fields": {},
        }
    finally:
        os.unlink(temp_path)


def extract_text_lines(result: Any) -> tuple[list[str], list[float]]:
    text_lines: list[str] = []
    scores: list[float] = []

    for page_result in result:
        data = result_to_dict(page_result)
        payload = data.get("res", data)

        rec_texts = payload.get("rec_texts") or payload.get("texts") or []
        rec_scores = payload.get("rec_scores") or payload.get("scores") or []

        text_lines.extend(str(text).strip() for text in rec_texts if str(text).strip())
        scores.extend(float(score) for score in rec_scores if is_number(score))

    return text_lines, scores


def assert_authorized(authorization: str | None) -> None:
    expected_api_key = os.getenv("OCR_API_KEY", "").strip()

    if not expected_api_key:
        return

    expected_header = f"Bearer {expected_api_key}"

    if not authorization or not secrets.compare_digest(authorization, expected_header):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OCR API key.",
        )


def result_to_dict(page_result: Any) -> dict[str, Any]:
    if isinstance(page_result, dict):
        return page_result

    json_value = getattr(page_result, "json", None)
    if callable(json_value):
        value = json_value()
        if isinstance(value, dict):
            return value
    elif isinstance(json_value, dict):
        return json_value

    res_value = getattr(page_result, "res", None)
    if isinstance(res_value, dict):
        return {"res": res_value}

    return {}


def is_number(value: Any) -> bool:
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


def average_score(scores: list[float]) -> float | None:
    if not scores:
        return None

    return round(sum(scores) / len(scores), 4)
