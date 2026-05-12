"""
api_server.py — FastAPI REST API for PP-OCRv5 Medical Form OCR

Endpoints
─────────
GET  /                 → health check + model info
GET  /health           → liveness probe (for GKE/Cloud Run)
POST /predict          → single image inference (multipart file upload)
POST /ocr              → DigiVax-compatible single image inference
POST /predict/batch    → batch inference (multiple files)
POST /validate         → inference + ground-truth validation

Run locally:
    uvicorn api_server:app --host 0.0.0.0 --port 8080 --reload

Run with gunicorn (production):
    gunicorn api_server:app -w 1 -k uvicorn.workers.UvicornWorker \
        -b 0.0.0.0:8080 --timeout 120
"""

import io
import base64
import json
import logging
import os
import re
import secrets
import time
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import cv2
import numpy as np

from ocr_engine import MedicalOCREngine

# ── configuration (env-overridable for Cloud Run) ─────────────────────────
MODEL_DIR  = os.getenv("MODEL_DIR",  "./model")
DICT_PATH  = os.getenv("DICT_PATH",  "./model/custom_dict.txt")
LOG_LEVEL  = os.getenv("LOG_LEVEL",  "INFO")
MAX_FILE_MB = int(os.getenv("MAX_FILE_MB", "20"))
OCR_API_KEY = os.getenv("OCR_API_KEY", "").strip()

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/bmp",
}

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
)
log = logging.getLogger("api_server")

# ── FastAPI app ────────────────────────────────────────────────────────────
app = FastAPI(
    title="PP-OCRv5 Medical Form OCR API",
    description=(
        "Fine-tuned PaddleOCR recognition model for medical forms. "
        "Fold-3 best model, retrained on full dataset."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── global engine (loaded at startup) ────────────────────────────────────
_engine: Optional[MedicalOCREngine] = None
_startup_error: Optional[str] = None


@app.on_event("startup")
async def startup():
    global _engine, _startup_error
    try:
        _engine = MedicalOCREngine(model_dir=MODEL_DIR, dict_path=DICT_PATH)
        log.info("Engine loaded successfully")
    except Exception as exc:
        _startup_error = str(exc)
        log.error("Engine startup failed: %s", exc)


def get_engine() -> MedicalOCREngine:
    if _engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"OCR engine not ready: {_startup_error}",
        )
    return _engine


# ── helpers ────────────────────────────────────────────────────────────────

async def _save_upload(upload: UploadFile) -> str:
    """Save uploaded file to a temp path and return the path."""
    if upload.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Use JPG, JPEG, PNG, or BMP.",
        )

    data = await upload.read()
    if len(data) > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_FILE_MB} MB limit",
        )
    suffix = Path(upload.filename).suffix if upload.filename else ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
        f.write(data)
        return f.name


def _result_to_dict(result) -> dict:
    return {
        "file_name": result.file_name,
        "recognized_text": result.recognized_text,
        "processing_time_ms": result.processing_time_ms,
        "image_size": result.image_size,
        "total_regions": result.total_regions,
        "avg_confidence": result.avg_confidence,
        "model_info": result.model_info,
    }


def _result_to_markdown(result) -> str:
    """Render OCR regions as a compact Markdown table for handoff/RAG demos."""
    lines = [
        f"# OCR Result: {result.file_name}",
        "",
        f"- Image size: {result.image_size[0]} x {result.image_size[1]}",
        f"- Total regions: {result.total_regions}",
        f"- Average confidence: {result.avg_confidence}",
        "",
        "| # | Field | Text | Confidence | Box |",
        "|---:|---|---|---:|---|",
    ]

    for index, item in enumerate(result.recognized_text, start=1):
        field = _escape_markdown_cell(str(item.get("field") or "Text"))
        value = _escape_markdown_cell(str(item.get("value") or ""))
        confidence = item.get("confidence", "")
        bbox = item.get("bbox") or []
        lines.append(f"| {index} | {field} | {value} | {confidence} | `{bbox}` |")

    return "\n".join(lines)


def _escape_markdown_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", "<br>")


def _result_to_visualization(image_path: str, result) -> dict:
    """Draw PaddleOCR-style colored boxes and labels over the submitted image."""
    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f"Cannot read image for visualization: {image_path}")

    overlay = image.copy()
    boxes_payload = []

    for index, item in enumerate(result.recognized_text, start=1):
        bbox = item.get("bbox") or []
        if len(bbox) != 4:
            continue

        x1, y1, x2, y2 = [int(v) for v in bbox]
        confidence = float(item.get("confidence") or 0)
        color = _confidence_color(confidence)

        cv2.rectangle(overlay, (x1, y1), (x2, y2), color, thickness=-1)
        cv2.rectangle(image, (x1, y1), (x2, y2), color, thickness=2)

        label = f"{index}"
        label_w, label_h = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)[0]
        label_x1 = x1
        label_y1 = max(0, y1 - label_h - 8)
        cv2.rectangle(
            image,
            (label_x1, label_y1),
            (label_x1 + label_w + 8, label_y1 + label_h + 8),
            color,
            thickness=-1,
        )
        cv2.putText(
            image,
            label,
            (label_x1 + 4, label_y1 + label_h + 3),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (20, 24, 30),
            thickness=2,
            lineType=cv2.LINE_AA,
        )

        boxes_payload.append({
            "index": index,
            "field": item.get("field"),
            "text": item.get("value"),
            "confidence": confidence,
            "bbox": [x1, y1, x2, y2],
        })

    image = cv2.addWeighted(overlay, 0.28, image, 0.72, 0)
    success, encoded = cv2.imencode(".png", image)
    if not success:
        raise ValueError("Failed to encode visualization image.")

    encoded_text = base64.b64encode(encoded.tobytes()).decode("ascii")
    return {
        "mimeType": "image/png",
        "dataUrl": f"data:image/png;base64,{encoded_text}",
        "boxes": boxes_payload,
    }


def _confidence_color(confidence: float) -> tuple[int, int, int]:
    if confidence >= 0.90:
        return (126, 224, 170)  # green, BGR
    if confidence >= 0.75:
        return (118, 204, 255)  # amber, BGR
    return (160, 150, 255)      # pink, BGR


def _clinic_record_from_result(result) -> dict:
    """Project OCR regions into the Under Five Clinic Record form shape."""
    width, height = result.image_size
    regions = _region_payloads(result.recognized_text, height)
    patient = {
        "name": "",
        "age": "",
        "dateOfBirth": "",
        "address": "",
        "motherName": "",
        "fatherName": "",
        "nutritionalStatus": "",
        "birthWeight": "",
        "epiStatus": "",
        "feedingType": "",
    }
    vaccines = []
    table_items = []

    label_map = {
        "name": ["name"],
        "age": ["age"],
        "dateOfBirth": ["dateofbirth"],
        "address": ["address"],
        "motherName": ["mothersname", "mothername"],
        "fatherName": ["fathersname", "fathername"],
        "nutritionalStatus": ["nutritionalstatus"],
        "birthWeight": ["birthweight"],
        "epiStatus": ["epistatus"],
        "feedingType": ["typeoffeeding"],
    }

    for patient_key, aliases in label_map.items():
        value = _find_label_value(regions, aliases, width, height)
        if value:
            patient[patient_key] = value

    patient["name"] = _clean_patient_name(patient["name"])
    patient["age"] = _clean_age(patient["age"])
    patient["nutritionalStatus"] = _clean_nutritional_status(patient["nutritionalStatus"])
    patient["dateOfBirth"] = _clean_date_text(patient["dateOfBirth"])

    epi_lines = [
        region["text"]
        for region in regions
            if region["rel_y"] < 0.36 and (
            "complete" in region["normalized"]
            or "incomplete" in region["normalized"]
            or _extract_vaccine_tokens(region["text"])
        )
    ]
    if epi_lines and not patient["epiStatus"]:
        patient["epiStatus"] = " ".join(epi_lines)

    for region in regions:
        text = region["text"]
        bbox = region["bbox"]
        field = region["field"]
        rel_y = region["rel_y"]

        if rel_y < 0.36:
            vaccines.extend(_extract_vaccine_tokens(text))
            continue
        if _is_table_header_text(text):
            continue

        table_items.append({
            "field": _table_field_from_bbox(field, bbox, width),
            "text": _strip_form_label(text) or text,
            "bbox": bbox,
            "centerY": (float(bbox[1]) + float(bbox[3])) / 2.0,
        })
        vaccines.extend(_extract_vaccine_tokens(text))

    return {
        "patient": patient,
        "vaccines": sorted(set(vaccines)),
        "visits": _build_visit_rows(table_items),
    }


def _clean_patient_name(value: str) -> str:
    corrections = {
        "Mgrie": "Marie",
        "Mqrie": "Marie",
        "Loena": "Lorena",
        "Lorcna": "Lorena",
    }
    return _space_compact_name(_replace_tokens(value, corrections))


def _clean_age(value: str) -> str:
    cleaned = value.strip(" )(:_-")
    cleaned = re.sub(r"(?<=\d)(?=[A-Za-z])", " ", cleaned)
    if cleaned.lower() == "month":
        return "1 month"
    return cleaned


def _clean_nutritional_status(value: str) -> str:
    corrections = {
        "Noomal": "Normal",
        "Nomai": "Normal",
        "Nomal": "Normal",
        "Nomas": "Normal",
    }
    return _replace_tokens(value, corrections)


def _clean_date_text(value: str) -> str:
    cleaned = value.strip(" )(:_")
    cleaned = cleaned.strip("(").replace("~", "-")
    return cleaned


def _normalize_weight(value: str) -> str:
    return (
        value.strip()
        .replace(" ", "")
        .replace("k9", "kg")
        .replace("ko", "kg")
        .replace("K9", "kg")
        .replace("Ko", "kg")
    )


def _space_compact_name(value: str) -> str:
    spaced = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", value)
    return re.sub(r"\s+", " ", spaced).strip()


def _replace_tokens(value: str, corrections: dict[str, str]) -> str:
    cleaned = value
    for wrong, right in corrections.items():
        cleaned = re.sub(rf"\b{re.escape(wrong)}\b", right, cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def _region_payloads(recognized_text: list[dict], img_h: int) -> list[dict]:
    regions = []
    for item in recognized_text:
        text = str(item.get("value") or "").strip()
        bbox = item.get("bbox") or [0, 0, 0, 0]
        if not text or len(bbox) != 4:
            continue

        regions.append({
            "text": text,
            "field": str(item.get("field") or "").strip(),
            "bbox": bbox,
            "normalized": _compact_lower(text),
            "center_x": (float(bbox[0]) + float(bbox[2])) / 2.0,
            "center_y": (float(bbox[1]) + float(bbox[3])) / 2.0,
            "rel_y": float(bbox[1]) / max(float(img_h), 1.0),
        })

    return regions


def _find_label_value(regions: list[dict], aliases: list[str], img_w: int, img_h: int) -> str:
    label_region = None
    inline_value = ""

    for region in regions:
        if region["rel_y"] >= 0.36:
            continue

        normalized = region["normalized"]
        matched_alias = next((alias for alias in aliases if alias in normalized), "")
        if not matched_alias:
            continue

        label_region = region
        inline_value = _strip_form_label(region["text"])
        if "typeoffeeding" in aliases and "for 0-1 only" in inline_value.lower():
            inline_value = ""
        if inline_value and _compact_lower(inline_value) != matched_alias:
            return inline_value
        break

    if not label_region:
        return ""

    candidates = []
    label_box = label_region["bbox"]
    label_right = float(label_box[2])
    label_left = float(label_box[0])
    label_center_y = label_region["center_y"]
    row_tolerance = max(26.0, img_h * 0.025)

    for region in regions:
        if region is label_region or region["rel_y"] >= 0.36:
            continue
        if _looks_like_form_label(region["normalized"]):
            continue
        if abs(region["center_y"] - label_center_y) > row_tolerance:
            continue

        candidate_left = float(region["bbox"][0])
        if candidate_left < label_left:
            continue
        if label_left < img_w * 0.5 and candidate_left > img_w * 0.5:
            continue
        if label_left >= img_w * 0.5 and candidate_left < img_w * 0.5:
            continue

        distance = max(0.0, candidate_left - label_right)
        y_distance = abs(region["center_y"] - label_center_y)
        candidates.append((y_distance, distance, candidate_left, region["text"]))

    if not candidates:
        return inline_value

    candidates.sort(key=lambda item: (item[0], item[1]))
    return candidates[0][3].strip(" :_-")


def _looks_like_form_label(normalized: str) -> bool:
    labels = [
        "name",
        "age",
        "dateofbirth",
        "address",
        "mothersname",
        "fathersname",
        "nutritionalstatus",
        "birthweight",
        "epistatus",
        "typeoffeeding",
    ]
    return any(label in normalized for label in labels)


def _is_table_header_text(value: str) -> bool:
    normalized = _compact_lower(value)
    headers = {
        "findingschiefcomplaint",
        "date",
        "wt",
        "vs",
        "episode",
        "dangersigns",
        "othercc",
        "management",
        "diarrhea",
        "ari",
    }
    return normalized in headers


def _build_visit_rows(items: list[dict]) -> list[dict]:
    rows = []

    for item in sorted(items, key=lambda current: (current["centerY"], current["bbox"][0])):
        row = None
        for candidate in rows:
            if abs(candidate["_centerY"] - item["centerY"]) <= 90:
                row = candidate
                break

        if row is None:
            row = {
                "id": f"row-{len(rows) + 1}",
                "_centerY": item["centerY"],
                "date": "",
                "wt": "",
                "vs": "",
                "episode": "",
                "dangerSigns": "",
                "otherCc": "",
                "management": "",
            }
            rows.append(row)

        key = _visit_key_for_field(item["field"])
        if key:
            row[key] = _merge_cell(row[key], item["text"])

    cleaned_rows = []
    for row in rows:
        row.pop("_centerY", None)
        row = _clean_visit_row(row)
        if any(value for key, value in row.items() if key != "id"):
            cleaned_rows.append(row)

    return cleaned_rows


def _clean_visit_row(row: dict) -> dict:
    for key in ["date", "wt", "episode", "dangerSigns", "otherCc", "management"]:
        row[key] = _normalize_common_cell(str(row.get(key) or ""))

    if not row["date"] and row["wt"]:
        split = _split_date_weight(row["wt"])
        if split:
            row["date"], row["wt"] = split

    if row["date"] and not row["wt"]:
        split = _split_date_weight(row["date"])
        if split:
            row["date"], row["wt"] = split

    row["wt"] = _normalize_weight(row["wt"])
    return row


def _split_date_weight(value: str) -> tuple[str, str] | None:
    compact = value.replace(" ", "")
    match = re.match(
        r"^([0-9()]{0,1}\d{1,2}[-~]\d{1,2}[-~]\d{2})(\d(?:\.\d)?k[g9o])$",
        compact,
        flags=re.IGNORECASE,
    )
    if not match:
        return None

    return _clean_date_text(match.group(1)), _normalize_weight(match.group(2))


def _normalize_common_cell(value: str) -> str:
    cleaned = value.strip()
    cleaned = cleaned.replace("IDIARRHEA", "(DIARRHEA)")
    cleaned = cleaned.replace("HepaB", "Hepa B")
    cleaned = re.sub(r"\bOPU(\d)\b", r"OPV\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bPCU(\d)\b", r"PCV\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bPental\b", "Penta1", cleaned, flags=re.IGNORECASE)
    return cleaned


def _visit_key_for_field(field: str) -> str:
    mapping = {
        "DATE": "date",
        "WT": "wt",
        "V/S": "vs",
        "Episode": "episode",
        "Danger Signs": "dangerSigns",
        "Other CC": "otherCc",
        "Management": "management",
    }
    return mapping.get(field, "")


def _table_field_from_bbox(field: str, bbox: list, img_w: int) -> str:
    if field in {"DATE", "WT", "V/S", "Episode", "Danger Signs", "Other CC", "Management"}:
        return field

    mid_x = (float(bbox[0]) + float(bbox[2])) / 2.0 / max(float(img_w), 1.0)
    columns = [
        (0.109, 0.215, "DATE"),
        (0.215, 0.283, "WT"),
        (0.283, 0.341, "V/S"),
        (0.341, 0.487, "Episode"),
        (0.487, 0.649, "Danger Signs"),
        (0.649, 0.758, "Other CC"),
        (0.758, 1.000, "Management"),
    ]
    for start, end, name in columns:
        if start <= mid_x < end:
            return name

    return field


def _merge_cell(existing: str, value: str) -> str:
    value = value.strip()
    if not value:
        return existing
    if not existing:
        return value
    return f"{existing}\n{value}"


def _strip_form_label(value: str) -> str:
    stripped = value.strip()
    stripped = re.sub(
        r"^(name|age|date\s*of\s*birth|dateofbirth|address|mother'?s?\s*name|father'?s?\s*name|"
        r"nutritional\s*status|nutritionalstatus|birth\s*weight|birthweight|epi\s*status|epistatus)\s*[:\-]?\s*",
        "",
        stripped,
        flags=re.IGNORECASE,
    )
    return stripped.strip(" :_-")


def _compact_lower(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _extract_vaccine_tokens(value: str) -> list[str]:
    tokens = []
    patterns = {
        "BCG": r"\bbcg\b",
        "DPT": r"\bdpt\b",
        "OPV": r"\bopv\s*\d*\b",
        "Hepa B": r"\bhepa\s*b\b|\bhepab\b",
        "AM": r"\bam\b",
        "PCV": r"\bpcv\s*\d*\b",
        "Penta": r"\bpenta\s*\d*\b|\bpental\b",
        "MMR": r"\bmmr\b",
    }
    normalized = value.lower()
    for label, pattern in patterns.items():
        if re.search(pattern, normalized, flags=re.IGNORECASE):
            tokens.append(label)
    return tokens


def _assert_authorized(authorization: Optional[str]) -> None:
    if not OCR_API_KEY:
        return

    expected = f"Bearer {OCR_API_KEY}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OCR API key.",
        )


def _digivax_text(result) -> str:
    lines = []

    for item in result.recognized_text:
        field = str(item.get("field") or "Text").strip()
        value = str(item.get("value") or "").strip()
        if value:
            lines.append(f"{field}: {value}")

    return "\n".join(lines).strip()


def _digivax_fields(result) -> dict:
    grouped = {}

    for item in result.recognized_text:
        field = str(item.get("field") or "").strip()
        value = str(item.get("value") or "").strip()
        confidence = float(item.get("confidence") or 0)

        if not field or not value:
            continue

        existing = grouped.get(field)
        if existing is None:
            grouped[field] = {"value": value, "confidence": confidence}
        else:
            existing["value"] = f"{existing['value']}\n{value}"
            existing["confidence"] = max(existing["confidence"], confidence)

    patient_name = _field_value(grouped, "Name")
    vaccination_date = _field_value(grouped, "DATE") or _field_value(grouped, "Date of Birth")
    vaccine_parts = [
        _field_value(grouped, "Other CC"),
        _field_value(grouped, "EPI Status"),
        _field_value(grouped, "EPI Vaccines"),
    ]
    vaccine_type = "\n".join(part for part in vaccine_parts if part).strip()

    fields = {
        "patientName": patient_name,
        "vaccineType": vaccine_type,
        "vaccinationDate": vaccination_date,
    }

    for field, payload in grouped.items():
        fields[field] = payload["value"]

    return {key: value for key, value in fields.items() if value}


def _field_value(grouped: dict, field: str) -> str:
    payload = grouped.get(field)
    if not payload:
        return ""

    return str(payload.get("value") or "").strip()


# ── routes ─────────────────────────────────────────────────────────────────

@app.get("/", summary="Root — model info")
async def root():
    return {
        "service": "PP-OCRv5 Medical Form OCR",
        "status": "ready" if _engine else "initialising",
        "model": MedicalOCREngine.MODEL_INFO,
        "endpoints": ["/ocr", "/predict", "/predict/batch", "/validate", "/health"],
    }


@app.get("/health", summary="Liveness probe")
async def health():
    if _engine is None:
        raise HTTPException(status_code=503, detail="Engine not ready")
    return {"status": "ok", "timestamp": time.time()}


@app.post("/predict", summary="Single-image inference")
async def predict(
    file: UploadFile = File(..., description="Medical form image"),
    authorization: Optional[str] = Header(default=None),
):
    """
    Upload a single `.jpg` medical form image and receive structured OCR output.

    Returns JSON:
    ```json
    {
      "file_name": "form1.jpg",
      "recognized_text": [
        {"field": "Patient Name", "value": "Juan Dela Cruz", "confidence": 0.95, "bbox": [...]},
        ...
      ],
      "processing_time_ms": 142.3,
      ...
    }
    ```
    """
    _assert_authorized(authorization)
    engine = get_engine()
    tmp = await _save_upload(file)
    try:
        result = engine.run(tmp)
    finally:
        Path(tmp).unlink(missing_ok=True)

    return JSONResponse(content=_result_to_dict(result))


@app.post("/ocr", summary="DigiVax-compatible OCR inference")
async def ocr(
    file: UploadFile = File(..., description="Medical form image"),
    authorization: Optional[str] = Header(default=None),
    include_markdown: bool = Query(default=True, description="Include a Markdown OCR table."),
    include_visualization: bool = Query(default=False, description="Include a base64 PNG with OCR boxes."),
):
    """
    DigiVax compatibility endpoint.

    The Next.js app expects `text`, optional `confidence`, and optional `fields`.
    This endpoint keeps the custom model output available under `raw`.
    """
    _assert_authorized(authorization)
    engine = get_engine()
    tmp = await _save_upload(file)
    try:
        result = engine.run(tmp)

        text = _digivax_text(result)
        if not text:
            raise HTTPException(status_code=422, detail="OCR did not detect readable text.")

        payload = {
            "text": text,
            "confidence": result.avg_confidence,
            "fields": _digivax_fields(result),
            "clinicRecord": _clinic_record_from_result(result),
            "raw": _result_to_dict(result),
        }

        if include_markdown:
            payload["markdown"] = _result_to_markdown(result)

        if include_visualization:
            payload["visualization"] = _result_to_visualization(tmp, result)

        return JSONResponse(content=payload)
    finally:
        Path(tmp).unlink(missing_ok=True)


@app.post("/predict/batch", summary="Batch inference")
async def predict_batch(
    files: list[UploadFile] = File(...),
    authorization: Optional[str] = Header(default=None),
):
    """Upload multiple medical form images. Returns a list of OCR results."""
    _assert_authorized(authorization)
    engine = get_engine()
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Max 20 images per batch")

    results = []
    for upload in files:
        tmp = await _save_upload(upload)
        try:
            r = engine.run(tmp)
            results.append(_result_to_dict(r))
        except Exception as exc:
            results.append({"file_name": upload.filename, "error": str(exc)})
        finally:
            Path(tmp).unlink(missing_ok=True)

    return JSONResponse(content={"batch_size": len(results), "results": results})


@app.post("/validate", summary="Inference + ground-truth validation")
async def validate(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(default=None),
    ground_truth: str = Form(
        ...,
        description='JSON string: {"Patient Name":"Juan Dela Cruz","Date":"2026-05-12"}'
    ),
):
    """
    Run inference and compare against provided ground-truth labels.

    `ground_truth` form field must be a JSON string mapping field names to expected values.
    """
    _assert_authorized(authorization)
    engine = get_engine()
    try:
        gt = json.loads(ground_truth)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid ground_truth JSON: {exc}")

    tmp = await _save_upload(file)
    try:
        result = engine.run(tmp)
        report = engine.validate(result, gt)
    finally:
        Path(tmp).unlink(missing_ok=True)

    payload = _result_to_dict(result)
    payload["validation"] = report
    return JSONResponse(content=payload)


# ── allow direct execution ─────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api_server:app", host="0.0.0.0", port=8080, reload=False)
