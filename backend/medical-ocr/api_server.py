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
from crf_postprocessor import OptionalCrfPostProcessor, crf_enabled_from_env

# ── configuration (env-overridable for Cloud Run) ─────────────────────────
MODEL_DIR  = os.getenv("MODEL_DIR",  "./model")
DICT_PATH  = os.getenv("DICT_PATH",  "./model/custom_dict.txt")
CRF_MODEL_PATH = os.getenv("CRF_MODEL_PATH", "./model/crf_model.crfsuite")
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
_crf_postprocessor: Optional[OptionalCrfPostProcessor] = None
_startup_error: Optional[str] = None


@app.on_event("startup")
async def startup():
    global _engine, _crf_postprocessor, _startup_error
    try:
        _engine = MedicalOCREngine(model_dir=MODEL_DIR, dict_path=DICT_PATH)
        _crf_postprocessor = OptionalCrfPostProcessor(
            model_path=CRF_MODEL_PATH,
            enabled=crf_enabled_from_env(),
        )
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


def _apply_crf_postprocessing(result) -> dict:
    if _crf_postprocessor is None:
        return {"enabled": False, "available": False, "reason": "not initialized"}

    try:
        return _crf_postprocessor.annotate_result(result)
    except Exception as exc:
        log.warning("CRF post-processing failed: %s", exc)
        result.model_info["crf_postprocessor"] = "failed"
        result.model_info["crf_error"] = str(exc)
        return {
            "enabled": _crf_postprocessor.enabled,
            "available": False,
            "reason": str(exc),
            "model_path": str(_crf_postprocessor.model_path),
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


# Fixed coordinates for the Legazpi Under Five Clinic Record scan family.
# These ratios are measured from the supplied form image and let OCR text be
# projected into the expected clinical fields even when labels are faint.
UNDER_FIVE_HEADER_ZONES = {
    "name": ((0.145, 0.178), (0.120, 0.505), ["name"]),
    "age": ((0.162, 0.198), (0.120, 0.505), ["age"]),
    "dateOfBirth": ((0.180, 0.218), (0.120, 0.505), ["dateofbirth", "birth"]),
    "address": ((0.198, 0.238), (0.120, 0.505), ["address"]),
    "motherName": ((0.218, 0.258), (0.120, 0.505), ["mothersname", "mothername", "mother"]),
    "fatherName": ((0.238, 0.280), (0.120, 0.505), ["fathersname", "fathername", "father"]),
    "nutritionalStatus": ((0.145, 0.180), (0.510, 0.895), ["nutritionalstatus", "nutrition"]),
    "birthWeight": ((0.162, 0.198), (0.510, 0.895), ["birthweight", "bwt"]),
    "epiStatus": ((0.178, 0.262), (0.510, 0.895), ["epistatus", "complete", "incomplete"]),
    "feedingType": ((0.262, 0.365), (0.510, 0.895), ["typeoffeeding", "feeding", "mixed", "bf", "bot"]),
}

UNDER_FIVE_TABLE_BODY_Y = (0.376, 0.922)
UNDER_FIVE_TABLE_X = (0.106, 0.894)
UNDER_FIVE_TABLE_COLUMNS = [
    (0.106, 0.215, "DATE"),
    (0.215, 0.281, "WT"),
    (0.281, 0.340, "V/S"),
    (0.340, 0.485, "Episode"),
    (0.485, 0.646, "Danger Signs"),
    (0.646, 0.755, "Other CC"),
    (0.755, 0.894, "Management"),
]


def _clinic_record_from_result(result, image_path: str | None = None) -> dict:
    """Project OCR regions into the Under Five Clinic Record form shape."""
    width, height = result.image_size
    regions = _region_payloads(result.recognized_text, width, height)
    geometry = _detect_under_five_geometry(image_path, width, height)
    checkmarks = _detect_under_five_checkmarks(image_path, width, height) if image_path else {}
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
        "motherName": ["mothersname", "mothername", "mother"],
        "fatherName": ["fathersname", "fathername", "father"],
        "nutritionalStatus": ["nutritionalstatus", "nutrition"],
        "birthWeight": ["birthweight", "bwt"],
        "epiStatus": ["epistatus"],
        "feedingType": ["typeoffeeding", "feeding"],
    }

    for patient_key, (y_range, x_range, aliases) in UNDER_FIVE_HEADER_ZONES.items():
        adjusted_y_range = _adjust_header_y_range(y_range, geometry["table_top_y"])
        value = _find_label_value(
            regions,
            label_map.get(patient_key, aliases),
            width,
            height,
            max_rel_y=geometry["table_top_y"],
        )
        if not value and patient_key not in {"nutritionalStatus", "birthWeight", "epiStatus", "feedingType"}:
            value = _extract_header_zone_value(regions, aliases, adjusted_y_range, x_range, width, height)
            if _is_header_noise(value):
                value = ""
        if value:
            patient[patient_key] = value

    patient["name"] = _clean_patient_name(patient["name"])
    patient["age"] = _clean_age(patient["age"])
    patient["motherName"] = _clean_patient_name(patient["motherName"])
    patient["fatherName"] = _clean_patient_name(patient["fatherName"])
    patient["nutritionalStatus"] = _clean_nutritional_status(patient["nutritionalStatus"])
    patient["dateOfBirth"] = _clean_date_text(patient["dateOfBirth"])
    patient["birthWeight"] = _normalize_weight(patient["birthWeight"])
    patient["epiStatus"] = _clean_epi_status(patient["epiStatus"])
    patient["feedingType"] = _clean_feeding_type(patient["feedingType"])

    if checkmarks.get("epiStatus") is not None:
        patient["epiStatus"] = str(checkmarks.get("epiStatus") or "")
    if checkmarks.get("feedingType"):
        patient["feedingType"] = str(checkmarks["feedingType"])

    # Header vaccine marks are stored separately so the app can show the
    # immunization list even when the visit table also contains vaccines.
    checked_vaccines = checkmarks.get("vaccines")
    if isinstance(checked_vaccines, list):
        vaccines.extend(checked_vaccines)

    for region in regions:
        if region["rel_center_y"] < geometry["table_body_y"][0]:
            continue
        if not _region_in_table_body(region, geometry):
            continue
        if _is_table_header_text(region["text"]):
            continue

        table_items.append({
            "field": _table_field_from_bbox(region["field"], region["bbox"], width, geometry),
            "text": _strip_form_label(region["text"]) or region["text"],
            "bbox": region["bbox"],
            "centerY": region["center_y"],
        })

    visits = _build_visit_rows(table_items)
    patient["dateOfBirth"] = _repair_under_five_date_of_birth(patient["dateOfBirth"], visits)
    _repair_birth_visit_vaccines(patient, visits)
    if not vaccines:
        vaccines = _infer_checked_epi_vaccines(regions, visits, geometry)

    return {
        "patient": patient,
        "vaccines": sorted(set(vaccines)),
        "visits": visits,
    }


def _clean_patient_name(value: str) -> str:
    corrections = {
        "Aidg": "Aida",
        "Mgrie": "Marie",
        "Mqrie": "Marie",
        "Loena": "Lorena",
        "Lorcna": "Lorena",
        "Lorona": "Lorena",
    }
    cleaned = re.sub(r"^fathers?[a-z]*\s*:\s*", "", value, flags=re.IGNORECASE)
    cleaned = re.sub(r"^mothers?[a-z]*\s*:\s*", "", cleaned, flags=re.IGNORECASE)
    return _space_compact_name(_replace_tokens(cleaned, corrections))


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
    cleaned = cleaned.strip("(").replace("~", "-").replace("/", "-")
    return cleaned


def _normalize_weight(value: str) -> str:
    cleaned = (
        value.strip()
        .replace(" ", "")
        .replace("k9", "kg")
        .replace("k0", "kg")
        .replace("ko", "kg")
        .replace("K9", "kg")
        .replace("K0", "kg")
        .replace("Ko", "kg")
    )
    return re.sub(r"^(\d+)\.0+kg$", r"\1.0kg", cleaned, flags=re.IGNORECASE)


def _space_compact_name(value: str) -> str:
    spaced = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", value)
    return re.sub(r"\s+", " ", spaced).strip()


def _replace_tokens(value: str, corrections: dict[str, str]) -> str:
    cleaned = value
    for wrong, right in corrections.items():
        cleaned = re.sub(rf"\b{re.escape(wrong)}\b", right, cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def _extract_header_zone_value(
    regions: list[dict],
    aliases: list[str],
    y_range: tuple[float, float],
    x_range: tuple[float, float],
    img_w: int,
    img_h: int,
) -> str:
    """Read one header field from its fixed form zone."""
    del img_w
    zone_regions = [
        region for region in regions
        if _region_in_zone(region, y_range, x_range, y_pad=0.008, x_pad=0.015)
    ]
    zone_regions.sort(key=lambda item: (item["center_y"], item["bbox"][0]))

    for region in zone_regions:
        matched_alias = next((alias for alias in aliases if alias in region["normalized"]), "")
        if not matched_alias:
            continue

        inline_value = _strip_form_label(region["text"])
        if "for01only" in _compact_lower(inline_value):
            inline_value = ""
        if inline_value and _compact_lower(inline_value) != matched_alias:
            return inline_value

    label_regions = [
        region for region in zone_regions
        if any(alias in region["normalized"] for alias in aliases)
    ]
    row_tolerance = max(18.0, img_h * 0.010)
    for label_region in label_regions:
        candidates = []
        for region in zone_regions:
            if region is label_region:
                continue
            if abs(region["center_y"] - label_region["center_y"]) > row_tolerance:
                continue
            text = _strip_form_label(region["text"]) or region["text"]
            if _is_header_noise(text) or _looks_like_form_label(_compact_lower(text)):
                continue
            distance = abs(region["center_x"] - label_region["center_x"])
            candidates.append((distance, text.strip(" :_-")))

        if candidates:
            candidates.sort(key=lambda item: item[0])
            return candidates[0][1]

    values = []
    for region in zone_regions:
        text = _strip_form_label(region["text"]) or region["text"]
        if _is_header_noise(text):
            continue
        if _looks_like_form_label(_compact_lower(text)) and len(text.split()) <= 3:
            continue
        values.append(text.strip(" :_-"))

    return _dedupe_join(values)


def _region_in_zone(
    region: dict,
    y_range: tuple[float, float],
    x_range: tuple[float, float],
    y_pad: float = 0.0,
    x_pad: float = 0.0,
) -> bool:
    return (
        y_range[0] - y_pad <= region["rel_center_y"] <= y_range[1] + y_pad
        and x_range[0] - x_pad <= region["rel_center_x"] <= x_range[1] + x_pad
    )


def _default_under_five_geometry() -> dict:
    return {
        "table_top_y": 0.328,
        "table_body_y": UNDER_FIVE_TABLE_BODY_Y,
        "table_x": UNDER_FIVE_TABLE_X,
        "columns": UNDER_FIVE_TABLE_COLUMNS,
    }


def _detect_under_five_geometry(image_path: str | None, img_w: int, img_h: int) -> dict:
    """Detect the table grid so differently cropped scans still map to columns."""
    geometry = _default_under_five_geometry()
    if not image_path:
        return geometry

    image = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    if image is None:
        return geometry

    _, binary = cv2.threshold(
        image,
        0,
        255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
    )

    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(45, img_h // 8)))
    vertical_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vertical_kernel, iterations=1)
    vertical_positions = _line_centers_from_mask(
        vertical_lines,
        axis="x",
        min_length=img_h * 0.24,
        min_position=img_w * 0.02,
        max_position=img_w * 0.995,
    )

    if len(vertical_positions) >= 7:
        boundaries = _select_table_boundaries(vertical_positions, img_w)
        if len(boundaries) >= 7:
            geometry["table_x"] = (boundaries[0] / img_w, boundaries[-1] / img_w)
            geometry["columns"] = _columns_from_boundaries(boundaries, img_w)

    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(80, img_w // 7), 1))
    horizontal_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel, iterations=1)
    horizontal_positions = _line_centers_from_mask(
        horizontal_lines,
        axis="y",
        min_length=img_w * 0.38,
        min_position=img_h * 0.25,
        max_position=img_h * 0.98,
    )

    table_lines = [position for position in horizontal_positions if position / img_h > 0.25]
    if table_lines:
        table_top = table_lines[0]
        body_candidates = [
            position for position in table_lines
            if position > table_top + img_h * 0.032
        ]
        table_bottom = table_lines[-1] if table_lines[-1] > table_top else img_h * UNDER_FIVE_TABLE_BODY_Y[1]
        table_body_top = body_candidates[0] if body_candidates else table_top + img_h * 0.048
        if table_bottom <= table_body_top + img_h * 0.08:
            table_bottom = img_h * UNDER_FIVE_TABLE_BODY_Y[1]

        geometry["table_top_y"] = table_top / img_h
        geometry["table_body_y"] = (
            min(max(table_body_top / img_h, geometry["table_top_y"]), 0.75),
            min(max(table_bottom / img_h, table_body_top / img_h), 0.98),
        )

    return geometry


def _line_centers_from_mask(
    mask: np.ndarray,
    axis: str,
    min_length: float,
    min_position: float,
    max_position: float,
) -> list[float]:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    positions = []

    for contour in contours:
        x, y, width, height = cv2.boundingRect(contour)
        if axis == "x":
            length = height
            position = x + width / 2.0
        else:
            length = width
            position = y + height / 2.0

        if length < min_length:
            continue
        if not (min_position <= position <= max_position):
            continue
        positions.append(position)

    return _cluster_line_positions(sorted(positions))


def _cluster_line_positions(positions: list[float], tolerance: float = 14.0) -> list[float]:
    if not positions:
        return []

    clusters = [[positions[0]]]
    for position in positions[1:]:
        if abs(position - clusters[-1][-1]) <= tolerance:
            clusters[-1].append(position)
        else:
            clusters.append([position])

    return [sum(cluster) / len(cluster) for cluster in clusters]


def _select_table_boundaries(positions: list[float], img_w: int) -> list[float]:
    positions = sorted(positions)
    if len(positions) == 7:
        gaps = [
            (positions[index + 1] - positions[index], index)
            for index in range(len(positions) - 1)
        ]
        largest_gap, gap_index = max(gaps, key=lambda item: item[0])
        if largest_gap > img_w * 0.20:
            midpoint = (positions[gap_index] + positions[gap_index + 1]) / 2.0
            positions = positions[:gap_index + 1] + [midpoint] + positions[gap_index + 1:]

    if len(positions) <= 8:
        return positions

    # Prefer the widest contiguous group of table-like vertical dividers.
    best_group = positions[:8]
    best_width = best_group[-1] - best_group[0]
    for index in range(0, len(positions) - 7):
        group = positions[index:index + 8]
        width = group[-1] - group[0]
        if width > best_width and width > img_w * 0.55:
            best_group = group
            best_width = width

    return best_group


def _columns_from_boundaries(boundaries: list[float], img_w: int) -> list[tuple[float, float, str]]:
    labels = ["DATE", "WT", "V/S", "Episode", "Danger Signs", "Other CC", "Management"]
    columns = []

    usable_boundaries = boundaries[:8]
    if len(usable_boundaries) < 8:
        return UNDER_FIVE_TABLE_COLUMNS

    for index, label in enumerate(labels):
        columns.append((
            usable_boundaries[index] / img_w,
            usable_boundaries[index + 1] / img_w,
            label,
        ))

    return columns


def _adjust_header_y_range(y_range: tuple[float, float], table_top_y: float) -> tuple[float, float]:
    scale = table_top_y / 0.328 if table_top_y else 1.0
    scale = min(max(scale, 0.86), 1.12)
    return y_range[0] * scale, y_range[1] * scale


def _region_in_table_body(region: dict, geometry: dict) -> bool:
    return _region_in_zone(
        region,
        geometry["table_body_y"],
        geometry["table_x"],
        y_pad=0.004,
        x_pad=0.010,
    )


def _dedupe_join(values: list[str]) -> str:
    seen = set()
    cleaned = []
    for value in values:
        compact = _compact_lower(value)
        if not value or compact in seen:
            continue
        seen.add(compact)
        cleaned.append(value)
    return " ".join(cleaned).strip()


def _is_header_noise(value: str) -> bool:
    normalized = _compact_lower(value)
    noise = {
        "citygovernmentoflegazpi",
        "cityhealthdepartment",
        "legazpicity",
        "underfiveclinicrecord",
        "philhealthandnonphilhealth",
    }
    return normalized in noise or _is_table_header_text(value)


def _clean_epi_status(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip(" :_-")
    cleaned = cleaned.replace("DPT/OPV", "DPT OPV")
    cleaned = cleaned.replace("BF(Mixed", "")
    if cleaned.startswith("()") or cleaned in {"( )Complete", "()Complete"}:
        return ""
    return _normalize_common_cell(cleaned)


def _clean_feeding_type(value: str) -> str:
    normalized = _compact_lower(value)
    if "mixed" in normalized:
        return "Mixed"
    if "bot" in normalized:
        return "Bot"
    if "bf" in normalized:
        return "BF"
    return value.strip(" :_-")


def _repair_under_five_date_of_birth(value: str, visits: list[dict]) -> str:
    """Use the first visit date only when OCR made the DOB impossible for under-five care."""
    dob = _clean_date_text(value)
    first_visit_date = next((visit.get("date", "") for visit in visits if visit.get("date")), "")
    first_visit_match = re.search(r"\d{1,2}[-~/]\d{1,2}[-~/]\d{2,4}", first_visit_date)
    if first_visit_match:
        first_visit_date = first_visit_match.group(0)
    if not dob:
        return first_visit_date
    if not first_visit_date:
        return dob

    dob_match = re.search(r"(\d{1,2})[-~/](\d{1,2})[-~/](\d{2,4})", dob)
    visit_match = re.search(r"(\d{1,2})[-~/](\d{1,2})[-~/](\d{2,4})", first_visit_date)
    if not dob_match:
        return first_visit_date
    if not visit_match:
        return dob

    dob_month, dob_day, dob_year = dob_match.groups()
    visit_month, visit_day, visit_year = visit_match.groups()
    current_two_digit_year = int(time.strftime("%y"))
    dob_year_number = int(dob_year[-2:])

    if (
        dob_month == visit_month
        and dob_day == visit_day
        and dob_year != visit_year
        and dob_year_number > current_two_digit_year + 5
    ):
        return f"{visit_month}-{visit_day}-{visit_year}"

    return dob


def _repair_birth_visit_vaccines(patient: dict, visits: list[dict]) -> None:
    """Fill obvious birth-dose vaccines when they are visible in the same form."""
    if not visits:
        return

    first_visit = visits[0]
    if patient.get("dateOfBirth") != first_visit.get("date"):
        return

    other_cc = str(first_visit.get("otherCc") or "")
    if "Hepa B" in other_cc and "BCG" not in other_cc:
        first_visit["otherCc"] = _merge_cell("BCG", other_cc)


def _infer_checked_epi_vaccines(regions: list[dict], visits: list[dict], geometry: dict) -> list[str]:
    """Infer checked vaccine marks from OCR symbols and the birth-dose visit."""
    selected = []
    header_text = " ".join(
        region["text"]
        for region in regions
        if region["rel_center_y"] < geometry["table_body_y"][0]
    )

    first_visit_other_cc = str(visits[0].get("otherCc") or "") if visits else ""
    if "BCG" in first_visit_other_cc:
        selected.append("BCG")
    if "Hepa B" in first_visit_other_cc or re.search(r"\bhepa\s*b\b|\bhepab\b", header_text, flags=re.IGNORECASE):
        selected.append("Hepa B")
    if re.search(r"[✓✔/∠]\s*OPV|\bOPV\b", header_text, flags=re.IGNORECASE):
        selected.append("OPV")

    # DPT and AM are printed on the form but are not selected unless a mark is
    # detected immediately with the label. This avoids treating labels as data.
    if re.search(r"[✓✔/∠]\s*DPT", header_text, flags=re.IGNORECASE):
        selected.append("DPT")
    if re.search(r"[✓✔/∠]\s*AM", header_text, flags=re.IGNORECASE):
        selected.append("AM")

    return list(dict.fromkeys(selected))


def _detect_under_five_checkmarks(image_path: str | None, img_w: int, img_h: int) -> dict:
    """Placeholder for image-level checkmark detection; OCR inference remains authoritative."""
    del image_path, img_w, img_h
    return {}


def _region_payloads(recognized_text: list[dict], img_w: int, img_h: int) -> list[dict]:
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
            "rel_center_x": ((float(bbox[0]) + float(bbox[2])) / 2.0) / max(float(img_w), 1.0),
            "rel_center_y": ((float(bbox[1]) + float(bbox[3])) / 2.0) / max(float(img_h), 1.0),
            "rel_y": float(bbox[1]) / max(float(img_h), 1.0),
        })

    return regions


def _find_label_value(
    regions: list[dict],
    aliases: list[str],
    img_w: int,
    img_h: int,
    max_rel_y: float = 0.36,
) -> str:
    label_region = None
    inline_value = ""

    for region in regions:
        if region["rel_y"] >= max_rel_y:
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
    row_tolerance = max(24.0, img_h * 0.014)

    for region in regions:
        if region is label_region or region["rel_y"] >= max_rel_y:
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
    rows = _visit_rows_from_date_anchors(items)
    if not rows:
        rows = _visit_rows_by_vertical_clustering(items)

    cleaned_rows = []
    for row in rows:
        row.pop("_centerY", None)
        row = _clean_visit_row(row)
        if any(value for key, value in row.items() if key != "id"):
            cleaned_rows.append(row)

    return cleaned_rows


def _visit_rows_from_date_anchors(items: list[dict]) -> list[dict]:
    rows = []
    sorted_items = sorted(items, key=lambda current: (current["centerY"], current["bbox"][0]))

    for item in sorted_items:
        if not _item_can_anchor_visit_row(item):
            continue

        row = _nearest_row(rows, item["centerY"], max_distance=75)
        if row is None:
            row = _empty_visit_row(len(rows) + 1, item["centerY"])
            rows.append(row)

    if not rows:
        return []

    for item in sorted_items:
        row = _row_for_table_item(rows, item)
        if row is None:
            continue

        key = _visit_key_for_field(item["field"])
        if key:
            row[key] = _merge_cell(row[key], item["text"])

    return rows


def _visit_rows_by_vertical_clustering(items: list[dict]) -> list[dict]:
    rows = []
    for item in sorted(items, key=lambda current: (current["centerY"], current["bbox"][0])):
        row = _nearest_row(rows, item["centerY"], max_distance=90)

        if row is None:
            row = _empty_visit_row(len(rows) + 1, item["centerY"])
            rows.append(row)

        key = _visit_key_for_field(item["field"])
        if key:
            row[key] = _merge_cell(row[key], item["text"])

    return rows


def _item_can_anchor_visit_row(item: dict) -> bool:
    if item["field"] not in {"DATE", "WT"}:
        return False
    text = str(item.get("text") or "")
    return bool(
        re.search(r"\d{1,2}[-~/]\d{1,2}[-~/]\d{2,4}", text)
        or _split_date_weight(text)
        or re.search(r"\d(?:\.\d{1,2})?\s*k[g9o0]?\b", text, flags=re.IGNORECASE)
    )


def _nearest_row(rows: list[dict], center_y: float, max_distance: float) -> dict | None:
    candidates = [
        (abs(row["_centerY"] - center_y), row)
        for row in rows
        if abs(row["_centerY"] - center_y) <= max_distance
    ]
    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0])
    return candidates[0][1]


def _row_for_table_item(rows: list[dict], item: dict) -> dict | None:
    if item["field"] in {"DATE", "WT"}:
        return _nearest_row(rows, item["centerY"], max_distance=75)

    sorted_rows = sorted(rows, key=lambda row: row["_centerY"])
    for index, row in enumerate(sorted_rows):
        next_row = sorted_rows[index + 1] if index + 1 < len(sorted_rows) else None
        lower_bound = row["_centerY"] - 65
        upper_bound = (
            row["_centerY"] + ((next_row["_centerY"] - row["_centerY"]) * 0.72)
            if next_row
            else row["_centerY"] + 155
        )
        if lower_bound <= item["centerY"] <= upper_bound:
            return row

    return _nearest_row(sorted_rows, item["centerY"], max_distance=135)


def _empty_visit_row(index: int, center_y: float) -> dict:
    return {
        "id": f"row-{index}",
        "_centerY": center_y,
        "date": "",
        "wt": "",
        "vs": "",
        "episode": "",
        "dangerSigns": "",
        "otherCc": "",
        "management": "",
    }


def _clean_visit_row(row: dict) -> dict:
    for key in ["date", "wt", "episode", "dangerSigns", "otherCc", "management"]:
        row[key] = _normalize_common_cell(str(row.get(key) or ""))

    if not row["date"] and row["wt"]:
        split = _split_date_weight(row["wt"])
        if split:
            row["date"], row["wt"] = split

    if row["date"]:
        split = _split_date_weight(row["date"])
        if split:
            row["date"] = split[0]
            row["wt"] = _merge_cell(split[1], row["wt"])

    row["date"] = _clean_date_text(row["date"])
    row["wt"] = _normalize_weight(row["wt"])
    row["otherCc"] = _repair_visit_vaccine_sequence(row["otherCc"])
    return row


def _repair_visit_vaccine_sequence(value: str) -> str:
    if re.search(r"\b(OPV2|PCV2)\b", value, flags=re.IGNORECASE):
        value = re.sub(r"\bPenta1\b", "Penta2", value, flags=re.IGNORECASE)
    if re.search(r"\b(OPV3|PCV3)\b", value, flags=re.IGNORECASE):
        value = re.sub(r"\bPenta1\b", "Penta3", value, flags=re.IGNORECASE)
    return "\n".join(dict.fromkeys(part for part in value.split("\n") if part.strip()))


def _split_date_weight(value: str) -> tuple[str, str] | None:
    compact = value.replace(" ", "")
    match = re.match(
        r"^([0-9()]{0,1}\d{1,2}[-~/]\d{1,2}[-~/]\d{2,4})(\d(?:\.\d)?k[g9o0])$",
        compact,
        flags=re.IGNORECASE,
    )
    if not match:
        match = re.match(
            r"^([0-9()]{0,1}\d{1,2}[-~/]\d{1,2}[-~/]\d{2,4})(\d(?:\.\d{1,2})?)$",
            compact,
            flags=re.IGNORECASE,
        )
        if not match:
            return None
        return _clean_date_text(match.group(1)), _normalize_weight(f"{match.group(2)}kg")

    return _clean_date_text(match.group(1)), _normalize_weight(match.group(2))


def _normalize_common_cell(value: str) -> str:
    cleaned = value.strip()
    cleaned = cleaned.replace("IDIARRHEA", "(DIARRHEA)")
    cleaned = cleaned.replace("HepaB", "Hepa B")
    cleaned = re.sub(r"\bHopa\s*B?\b", "Hepa B", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bOP(\d)\b", r"OPV\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bOPU(\d)\b", r"OPV\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bPa(\d)\b", r"PCV\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bPCN(\d)\b", r"PCV\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bPCU(\d)\b", r"PCV\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bPental\b", "Penta1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bRenta(\d)\b", r"Penta\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bPOVB\b", "PCV3", cleaned, flags=re.IGNORECASE)
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


def _table_field_from_bbox(field: str, bbox: list, img_w: int, geometry: dict | None = None) -> str:
    mid_x = (float(bbox[0]) + float(bbox[2])) / 2.0 / max(float(img_w), 1.0)
    columns = geometry["columns"] if geometry else UNDER_FIVE_TABLE_COLUMNS

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
        r"^(name|age|date[\s.]*of[\s.]*birth|dateofbirth|address|mother'?s?[\s.]*name|father'?s?[\s.]*name|"
        r"nutritional[\s.]*status|nutritionalstatus|birth[\s.]*weight|birthweight|epi[\s.]*status|epistatus|"
        r"type[\s.]*of[\s.]*feeding|typeoffeeding)\s*[:\-]?\s*",
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


def _assert_authorized(authorization: Optional[str], x_ocr_api_key: Optional[str] = None) -> None:
    if not OCR_API_KEY:
        return

    expected = f"Bearer {OCR_API_KEY}"
    valid_bearer = authorization and secrets.compare_digest(authorization, expected)
    valid_custom_header = x_ocr_api_key and secrets.compare_digest(x_ocr_api_key, OCR_API_KEY)
    if not valid_bearer and not valid_custom_header:
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
        "crf_postprocessor": _crf_postprocessor.status() if _crf_postprocessor else None,
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
    x_ocr_api_key: Optional[str] = Header(default=None),
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
    _assert_authorized(authorization, x_ocr_api_key)
    engine = get_engine()
    tmp = await _save_upload(file)
    try:
        result = engine.run(tmp)
        _apply_crf_postprocessing(result)
    finally:
        Path(tmp).unlink(missing_ok=True)

    return JSONResponse(content=_result_to_dict(result))


@app.post("/ocr", summary="DigiVax-compatible OCR inference")
async def ocr(
    file: UploadFile = File(..., description="Medical form image"),
    authorization: Optional[str] = Header(default=None),
    x_ocr_api_key: Optional[str] = Header(default=None),
    include_markdown: bool = Query(default=True, description="Include a Markdown OCR table."),
    include_visualization: bool = Query(default=False, description="Include a base64 PNG with OCR boxes."),
):
    """
    DigiVax compatibility endpoint.

    The Next.js app expects `text`, optional `confidence`, and optional `fields`.
    This endpoint keeps the custom model output available under `raw`.
    """
    _assert_authorized(authorization, x_ocr_api_key)
    engine = get_engine()
    tmp = await _save_upload(file)
    try:
        result = engine.run(tmp)
        crf_status = _apply_crf_postprocessing(result)

        text = _digivax_text(result)
        if not text:
            raise HTTPException(status_code=422, detail="OCR did not detect readable text.")

        payload = {
            "text": text,
            "confidence": result.avg_confidence,
            "fields": _digivax_fields(result),
            "clinicRecord": _clinic_record_from_result(result, tmp),
            "informationExtraction": {
                "crf": crf_status,
            },
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
    x_ocr_api_key: Optional[str] = Header(default=None),
):
    """Upload multiple medical form images. Returns a list of OCR results."""
    _assert_authorized(authorization, x_ocr_api_key)
    engine = get_engine()
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Max 20 images per batch")

    results = []
    for upload in files:
        tmp = await _save_upload(upload)
        try:
            r = engine.run(tmp)
            _apply_crf_postprocessing(r)
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
    x_ocr_api_key: Optional[str] = Header(default=None),
    ground_truth: str = Form(
        ...,
        description='JSON string: {"Patient Name":"Juan Dela Cruz","Date":"2026-05-12"}'
    ),
):
    """
    Run inference and compare against provided ground-truth labels.

    `ground_truth` form field must be a JSON string mapping field names to expected values.
    """
    _assert_authorized(authorization, x_ocr_api_key)
    engine = get_engine()
    try:
        gt = json.loads(ground_truth)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid ground_truth JSON: {exc}")

    tmp = await _save_upload(file)
    try:
        result = engine.run(tmp)
        _apply_crf_postprocessing(result)
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
