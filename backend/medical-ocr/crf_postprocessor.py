"""Optional CRF token classifier for OCR post-processing.

The classifier is deliberately non-authoritative: it annotates OCR tokens with
CRF labels for downstream retrieval/review, while the existing OCR result and
clinic-record parser remain the source of truth.
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DATE_RE = re.compile(r"\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4}")
VACCINE_RE = re.compile(
    r"\b(BCG|HEPA\s*B|HEPAB|HEPB|DPT|DTP|OPV|0PV|IPV|PCV|PENTA|PENTO|ROTA|AM|MCV|MMR)\s*\d*\b",
    re.IGNORECASE,
)


class OptionalCrfPostProcessor:
    """Loads and applies a CRF model only when explicitly enabled."""

    def __init__(self, model_path: str, enabled: bool = False):
        self.model_path = Path(model_path)
        self.enabled = enabled
        self.available = False
        self.reason = "disabled"
        self._tagger: Any = None

        if not enabled:
            return

        if not self.model_path.exists():
            self.reason = f"model not found: {self.model_path}"
            logger.warning("CRF post-processor disabled: %s", self.reason)
            return

        try:
            import pycrfsuite

            tagger = pycrfsuite.Tagger()
            tagger.open(str(self.model_path))
            self._tagger = tagger
            self.available = True
            self.reason = "ready"
            logger.info("CRF post-processor loaded: %s", self.model_path)
        except Exception as exc:
            self.reason = f"load failed: {exc}"
            logger.warning("CRF post-processor disabled: %s", self.reason)

    def annotate_result(self, result: Any) -> dict[str, Any]:
        """Annotate result.recognized_text in-place and return status info."""
        if not self.available or self._tagger is None:
            return self.status()

        words = self._words_from_result(result)
        if not words:
            return {**self.status(), "token_count": 0}

        features = [self._word_features(words, index) for index in range(len(words))]
        labels = self._tagger.tag(features)

        for word, label in zip(words, labels):
            item = result.recognized_text[word["source_index"]]
            item["crf_label"] = label
            item["row"] = word["row"]
            item["section"] = word["section"]

        result.model_info["crf_postprocessor"] = "enabled"
        result.model_info["crf_model"] = self.model_path.name
        result.model_info["crf_token_count"] = len(words)

        return {**self.status(), "token_count": len(words), "labels": sorted(set(labels))}

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "available": self.available,
            "reason": self.reason,
            "model_path": str(self.model_path),
        }

    @staticmethod
    def _words_from_result(result: Any) -> list[dict[str, Any]]:
        width, height = _image_size(result)
        words = []

        for index, item in enumerate(getattr(result, "recognized_text", []) or []):
            text = str(item.get("value") or item.get("text") or "").strip()
            bbox = item.get("bbox") or []
            if not text or len(bbox) != 4:
                continue

            x1, y1, x2, y2 = [float(value) for value in bbox]
            words.append({
                "source_index": index,
                "text": text,
                "ocr_text": text,
                "x": x1,
                "y": y1,
                "x_max": x2,
                "y_max": y2,
                "page_w": width,
                "page_h": height,
            })

        _assign_rows(words)
        _assign_sections(words, width, height)
        return sorted(words, key=lambda word: (word["row"], word["x"]))

    @staticmethod
    def _word_features(words: list[dict[str, Any]], index: int) -> dict[str, Any]:
        word = words[index]
        raw = str(word.get("ocr_text") or word.get("text") or "").strip()
        page_w = float(word.get("page_w") or 1)
        page_h = float(word.get("page_h") or 1)
        x_norm = round(float(word.get("x") or 0) / max(page_w, 1), 3)
        y_norm = round(float(word.get("y") or 0) / max(page_h, 1), 3)

        features: dict[str, Any] = {
            "bias": 1.0,
            "text.lower": raw.lower(),
            "text.isupper": raw.isupper(),
            "has_date_pattern": bool(_clean_date_text(raw)),
            "vaccine_norm": _detect_vaccine(raw) or "",
            "x_norm": str(x_norm),
            "y_norm": str(y_norm),
            "zone_table": y_norm >= 0.45,
            "row_bin": str(int(float(word.get("row", 0))) % 40),
        }

        if index > 0:
            previous = words[index - 1]
            features["prev.lower"] = str(previous.get("text") or "").lower()
            features["same_row_prev"] = word.get("row") == previous.get("row")
        else:
            features["BOS"] = True

        return features


def _image_size(result: Any) -> tuple[float, float]:
    image_size = getattr(result, "image_size", None) or [1, 1]
    if len(image_size) < 2:
        return 1.0, 1.0
    return float(image_size[0] or 1), float(image_size[1] or 1)


def _assign_rows(words: list[dict[str, Any]], gap_threshold: float = 30.0) -> None:
    current_row = 0
    previous_y: float | None = None

    for word in sorted(words, key=lambda item: float(item.get("y") or 0)):
        y = float(word.get("y") or 0)
        if previous_y is not None and y - previous_y > gap_threshold:
            current_row += 1
        word["row"] = current_row
        previous_y = y


def _assign_sections(words: list[dict[str, Any]], width: float, height: float) -> None:
    for word in words:
        x_norm = float(word.get("x") or 0) / max(width, 1)
        y_norm = float(word.get("y") or 0) / max(height, 1)

        if y_norm < 0.15:
            section = "HEADER"
        elif y_norm >= 0.36:
            section = "TABLE_RECORDS"
        elif x_norm < 0.5:
            section = "PATIENT_INFORMATION"
        else:
            section = "NUTRITIONAL_STATUS"

        word["section"] = section


def _clean_date_text(text: str) -> str | None:
    normalized = str(text).upper()
    normalized = normalized.replace("O", "0").replace("I", "1").replace("L", "1")
    normalized = normalized.replace(".", "-").replace("_", "-")
    match = DATE_RE.search(normalized)
    if not match:
        return None
    return re.sub(r"\s*[-/.]\s*", "-", match.group()).strip("-")


def _detect_vaccine(text: str) -> str | None:
    match = VACCINE_RE.search(str(text))
    if not match:
        return None

    normalized = match.group(1).upper().replace(" ", "")
    aliases = {
        "0PV": "OPV",
        "DTP": "DPT",
        "HEPAB": "HEPB",
        "HEPA": "HEPB",
        "PENTO": "PENTA",
    }
    return aliases.get(normalized, normalized)


def crf_enabled_from_env() -> bool:
    return os.getenv("MEDICAL_OCR_ENABLE_CRF", "").strip().lower() in {"1", "true", "yes", "on"}
