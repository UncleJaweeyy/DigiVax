"""
PP-OCRv5 Medical Form OCR Engine
Calibrated for: Under Five Clinic Record — City Health Department, Legazpi City

Layout (measured from actual form images):
  ┌─────────────────────────────────────────────────────┐
  │  HEADER  (y: 0% – 33%)                              │
  │  Left half (x < 50%): Name, Age, DOB, Address,      │
  │                        Mother's Name, Father's Name  │
  │  Right half (x > 50%): Nutritional Status,           │
  │                         Birth Weight, EPI Status     │
  ├─────────────────────────────────────────────────────┤
  │  TABLE HEADER ROW  (y: 33% – 38%)                   │
  │  DATE | WT | V/S | EPISODE | DANGER SIGNS |          │
  │  OTHER CC | MANAGEMENT                               │
  ├────────┬──────┬────┬────────┬────────┬──────┬───────┤
  │  DATE  │  WT  │V/S │EPISODE │DANGER  │OTHER │MGMT   │
  │(11-22%)│(22-28│28-34│34-49% │49-65%  │65-76%│76-90% │
  └────────┴──────┴────┴────────┴────────┴──────┴───────┘
"""

import os
import cv2
import re
import time
import logging
import numpy as np
from pathlib import Path
from dataclasses import dataclass
from typing import Any, Optional

# Force CPU before anything paddle-related is imported
os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ["FLAGS_use_cuda"]       = "0"
os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("FLAGS_enable_pir_api", "0")
os.environ.setdefault("DISABLE_MODEL_SOURCE_CHECK", "True")

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Layout constants — measured from actual form scans
# ---------------------------------------------------------------------------

HEADER_END    = 0.33
TABLE_HDR_END = 0.38
HEADER_MID_X  = 0.50

HEADER_ROWS = [
    (0.00, 0.13, "Name"),
    (0.13, 0.17, "Age"),
    (0.17, 0.21, "Date of Birth"),
    (0.21, 0.26, "Address"),
    (0.26, 0.30, "Mother's Name"),
    (0.30, 0.33, "Father's Name"),
]

HEADER_ROWS_RIGHT = [
    (0.00, 0.14, "Nutritional Status"),
    (0.14, 0.18, "Birth Weight"),
    (0.18, 0.33, "EPI Status"),
]

TABLE_COLS = [
    (0.000, 0.109, "Row Number"),
    (0.109, 0.215, "DATE"),
    (0.215, 0.283, "WT"),
    (0.283, 0.341, "V/S"),
    (0.341, 0.487, "Episode"),
    (0.487, 0.649, "Danger Signs"),
    (0.649, 0.758, "Other CC"),
    (0.758, 0.896, "Management"),
    (0.896, 1.000, "Notes"),
]

FIELD_KEYWORDS = {
    "Name":               ["name:"],
    "Age":                ["age:"],
    "Date of Birth":      ["date of birth", "birth:"],
    "Address":            ["address:"],
    "Mother's Name":      ["mother"],
    "Father's Name":      ["father"],
    "Nutritional Status": ["nutritional", "nutrition"],
    "Birth Weight":       ["birth weight", "bwt"],
    "EPI Status":         ["epi", "complete", "incomplete", "bcg", "dpt", "opv", "hepa"],
    "DATE":               [],
    "WT":                 ["kg"],
    "V/S":                [],
    "Episode":            ["diarrhea", "colds", "fever", "vomit"],
    "Danger Signs":       ["ari", "danger"],
    "Other CC":           ["bcg", "hepa", "opv", "pcv", "penta", "mmr", "flu", "tt", "td", "vit", "je", "mcv", "rota", "dpt", "dpt booster"],
    "Management":         [],
}

STATIC_FORM_TEXT = {
    "citygovernmentoflegazpi",
    "cityhealthdepartment",
    "legazpicity",
    "underfiveclinicrecord",
    "philhealthandnonphilhealth",
    "name",
    "age",
    "dateofbirth",
    "address",
    "mothersname",
    "fathersname",
    "nutritionalstatus",
    "birthweight",
    "epistatus",
    "complete",
    "incomplete",
    "typeoffeeding",
    "for01only",
    "date",
    "wt",
    "vs",
    "findingschiefcomplaint",
    "episode",
    "diarrhea",
    "dangersigns",
    "ari",
    "othercc",
    "management",
    "bf",
    "mixed",
    "bot",
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class TextRegion:
    bbox: list
    text: str
    confidence: float
    field: Optional[str] = None


@dataclass
class OCRResult:
    file_name: str
    recognized_text: list
    processing_time_ms: float
    image_size: list
    total_regions: int
    avg_confidence: float
    model_info: dict


# ---------------------------------------------------------------------------
# Pre-processing — matches inference.yml exactly
# ---------------------------------------------------------------------------

class RecResizeImg:
    def __init__(self, image_shape=(3, 48, 320)):
        self.image_shape = image_shape

    def __call__(self, img):
        _, imgH, imgW = self.image_shape
        h, w = img.shape[:2]
        ratio = w / float(h)
        resized_w = imgW if ratio * imgH > imgW else int(np.ceil(imgH * ratio))
        resized = cv2.resize(img, (resized_w, imgH)).astype(np.float32)
        resized = resized.transpose((2, 0, 1)) / 255.0
        resized = (resized - 0.5) / 0.5
        padded = np.zeros(self.image_shape, dtype=np.float32)
        padded[:, :, :resized_w] = resized
        valid_ratio = min(1.0, float(resized_w) / imgW)
        return padded, valid_ratio


# ---------------------------------------------------------------------------
# CTC Decoder
# ---------------------------------------------------------------------------

class CTCDecoder:
    def __init__(self, character_dict_path, use_space_char=True):
        self.character_list = self._load_dict(character_dict_path, use_space_char)
        # This export reserves two CTC classes before the first real character,
        # while custom_dict.txt begins with "#". Treating those reserved slots
        # as real characters shifts text like "City" into "#Djuz"/"Djuz".
        if self.character_list and self.character_list[0] == "#":
            self.blank_idx = 0
            self.character_list = self.character_list[1:]
            self.index_offset = 2
        else:
            self.blank_idx = len(self.character_list)
            self.index_offset = 0
        logger.info("CTCDecoder: vocab size = %d", len(self.character_list))

    @staticmethod
    def _load_dict(path, use_space_char):
        chars = []
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                c = line.rstrip("\n")
                if c:
                    chars.append(c)
        if use_space_char and " " not in chars:
            chars.append(" ")
        return chars

    def decode(self, logits):
        best  = np.argmax(logits, axis=1)
        probs = logits[np.arange(len(logits)), best]
        chars, conf_sum, count = [], 0.0, 0
        prev = -1
        for idx, prob in zip(best, probs):
            if idx != prev and idx != self.blank_idx:
                char_idx = idx - self.index_offset
                if 0 <= char_idx < len(self.character_list):
                    chars.append(self.character_list[char_idx])
                    conf_sum += float(prob)
                    count    += 1
            prev = idx
        text       = "".join(chars).strip()
        confidence = (conf_sum / count) if count > 0 else 0.0
        return text, confidence


# ---------------------------------------------------------------------------
# Main Engine
# ---------------------------------------------------------------------------

class MedicalOCREngine:

    MODEL_INFO = {
        "model_name":  "PP-OCRv5_mobile_rec",
        "fold":        3,
        "training":    "full_dataset",
        "backbone":    "PPLCNetV3",
        "encoder":     "EncoderWithSVTR",
        "decoder":     "MultiHead_CTC",
        "input_shape": [3, 48, 320],
        "vocab_size":  109,
        "form_type":   "Under Five Clinic Record — Legazpi City Health Department",
    }

    def __init__(self, model_dir: str, dict_path: str):
        self.model_dir = Path(model_dir)
        self.dict_path = Path(dict_path)
        self._validate_paths()
        self.resizer           = RecResizeImg()
        self.decoder           = CTCDecoder(str(self.dict_path))
        self._predictor        = None
        self._paddle_available = False
        self._paddleocr_engine = None
        self._paddleocr_available = False
        self._last_hybrid_custom_reads = 0
        self.pipeline = os.getenv("MEDICAL_OCR_PIPELINE", "hybrid").strip().lower()

        if self.pipeline != "custom":
            self._try_load_paddleocr()

        if self.pipeline in {"custom", "hybrid"} or not self._paddleocr_available:
            self._try_load_paddle()

    def _validate_paths(self):
        required = {
            "inference.json":      self.model_dir / "inference.json",
            "inference.pdiparams": self.model_dir / "inference.pdiparams",
            "custom_dict.txt":     self.dict_path,
        }
        missing = [k for k, v in required.items() if not v.exists()]
        if missing:
            raise FileNotFoundError(f"Missing model files: {missing}")

    def _try_load_paddle(self):
        """Load PaddlePaddle predictor in CPU-only mode."""
        if os.getenv("MEDICAL_OCR_DISABLE_PADDLE", "").lower() in {"1", "true", "yes"}:
            logger.warning("Paddle predictor disabled by MEDICAL_OCR_DISABLE_PADDLE; using simulation mode")
            return

        try:
            import paddle
            paddle.device.set_device("cpu")

            import paddle.inference as pi

            config = pi.Config(
                str(self.model_dir / "inference.json"),
                str(self.model_dir / "inference.pdiparams"),
            )
            config.disable_gpu()
            config.disable_mkldnn()          # avoids MKL-DNN issues on some machines
            config.switch_ir_optim(False)    # skip IR optimisation — faster cold start
            config.switch_use_feed_fetch_ops(False)

            self._predictor        = pi.create_predictor(config)
            self._paddle_available = True
            logger.info("PaddlePaddle loaded — CPU mode")

        except ImportError:
            logger.warning(
                "paddlepaddle not installed. "
                "Run: pip install paddlepaddle==2.6.1"
            )
        except Exception as exc:
            logger.warning("Predictor load failed (%s) — running in simulation mode", exc)

    def _try_load_paddleocr(self):
        """Load PaddleOCR's real PP-OCRv5 detection + recognition pipeline."""
        if os.getenv("MEDICAL_OCR_DISABLE_PADDLEOCR", "").lower() in {"1", "true", "yes"}:
            logger.warning("PaddleOCR pipeline disabled by MEDICAL_OCR_DISABLE_PADDLEOCR")
            return

        try:
            from paddleocr import PaddleOCR

            self._paddleocr_engine = PaddleOCR(
                text_detection_model_name=os.getenv("PADDLEOCR_DET_MODEL", "PP-OCRv5_server_det"),
                text_recognition_model_name=os.getenv("PADDLEOCR_REC_MODEL", "PP-OCRv5_server_rec"),
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
            )
            self._paddleocr_available = True
            logger.info("PaddleOCR PP-OCRv5 pipeline loaded")
        except ImportError as exc:
            logger.warning("PaddleOCR import failed (%s); falling back to custom medical recognizer", exc)
        except Exception as exc:
            logger.warning("PaddleOCR pipeline load failed (%s); falling back to custom medical recognizer", exc)

    # ------------------------------------------------------------------
    # Detection
    # ------------------------------------------------------------------

    @staticmethod
    def _result_to_dict(page_result: Any) -> dict:
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

    @classmethod
    def _extract_paddleocr_regions(cls, result: Any, img_h: int, img_w: int) -> list[TextRegion]:
        regions = []

        for page_result in result:
            data = cls._result_to_dict(page_result)
            payload = data.get("res", data)

            texts = payload.get("rec_texts") or payload.get("texts") or []
            scores = payload.get("rec_scores") or payload.get("scores") or []
            boxes = cls._first_present(
                payload,
                ["rec_boxes", "dt_boxes", "rec_polys", "polys"],
            )

            for index, raw_text in enumerate(texts):
                text = str(raw_text).strip()
                if not text:
                    continue

                confidence = cls._safe_float(scores[index] if index < len(scores) else 0)
                bbox = cls._normalize_paddleocr_box(boxes[index] if index < len(boxes) else [], img_w, img_h)
                if not bbox:
                    continue

                field = cls._assign_field(text, bbox, img_h, img_w)
                regions.append(TextRegion(
                    bbox=bbox,
                    text=text,
                    confidence=round(confidence, 4),
                    field=field,
                ))

        return sorted(regions, key=lambda item: (item.bbox[1] // 20, item.bbox[0]))

    def _extract_hybrid_regions(self, result: Any, img_bgr: np.ndarray, img_h: int, img_w: int) -> list[TextRegion]:
        """Use PP-OCRv5 boxes, then re-read crops with the fine-tuned medical recognizer."""
        paddle_regions = self._extract_paddleocr_regions(result, img_h, img_w)
        hybrid_regions = []
        custom_reads = 0

        for region in paddle_regions:
            if not self._should_run_custom_recognizer(region, img_h, img_w):
                hybrid_regions.append(region)
                continue

            x1, y1, x2, y2 = self._expanded_bbox(region.bbox, img_w, img_h)
            crop = img_bgr[y1:y2, x1:x2]
            if crop.size == 0:
                hybrid_regions.append(region)
                continue

            custom_reads += 1
            custom_text, custom_conf = self._recognize_region(crop)
            text = self._choose_hybrid_text(
                paddle_text=region.text,
                paddle_conf=region.confidence,
                custom_text=custom_text,
                custom_conf=custom_conf,
                bbox=region.bbox,
                img_h=img_h,
            )
            confidence = custom_conf if text == custom_text else region.confidence

            hybrid_regions.append(TextRegion(
                bbox=region.bbox,
                text=text,
                confidence=round(float(confidence), 4),
                field=self._assign_field(text, region.bbox, img_h, img_w),
            ))

        self._last_hybrid_custom_reads = custom_reads
        return sorted(hybrid_regions, key=lambda item: (item.bbox[1] // 20, item.bbox[0]))

    @classmethod
    def _should_run_custom_recognizer(cls, region: TextRegion, img_h: int, img_w: int) -> bool:
        """Re-read only likely handwritten/value boxes with the fine-tuned recognizer."""
        x1, y1, x2, y2 = region.bbox
        width = max(0, x2 - x1)
        height = max(0, y2 - y1)
        if width < 10 or height < 8:
            return False

        rel_y = y1 / max(float(img_h), 1.0)
        rel_x = x1 / max(float(img_w), 1.0)
        normalized = cls._compact_text(region.text)

        if cls._is_static_form_text(normalized):
            return False

        # Header/table value regions carry the handwriting we care about most.
        if rel_y >= 0.33:
            return True

        # Re-read likely filled-in header values but keep confident printed text as-is.
        if region.confidence < 0.92:
            return True
        if rel_y < 0.33 and (rel_x > 0.16 or ":" not in region.text):
            return True

        return False

    @staticmethod
    def _compact_text(value: str) -> str:
        return re.sub(r"[^a-z0-9]", "", value.lower())

    @classmethod
    def _is_static_form_text(cls, normalized: str) -> bool:
        if not normalized:
            return False
        if normalized in STATIC_FORM_TEXT:
            return True
        return any(token in normalized for token in STATIC_FORM_TEXT if len(token) >= 8)

    @staticmethod
    def _expanded_bbox(bbox: list[int], img_w: int, img_h: int) -> list[int]:
        x1, y1, x2, y2 = bbox
        return [
            max(0, x1 - 3),
            max(0, y1 - 3),
            min(img_w, x2 + 3),
            min(img_h, y2 + 3),
        ]

    @staticmethod
    def _choose_hybrid_text(
        paddle_text: str,
        paddle_conf: float,
        custom_text: str,
        custom_conf: float,
        bbox: list[int],
        img_h: int,
    ) -> str:
        custom_text = custom_text.strip()
        if not custom_text or custom_conf < 0.84:
            return paddle_text

        rel_y = bbox[1] / max(float(img_h), 1.0)
        compact_custom = custom_text.replace(" ", "")
        compact_paddle = paddle_text.replace(" ", "")

        if rel_y < 0.36:
            if ":" in custom_text:
                return custom_text
            if any(char.isdigit() for char in custom_text) and custom_conf >= 0.90:
                return custom_text
            if paddle_conf < 0.90 and len(compact_custom) >= max(3, len(compact_paddle) - 3):
                return custom_text

        if rel_y >= 0.36 and custom_conf >= 0.90:
            return custom_text

        return paddle_text

    @staticmethod
    def _normalize_paddleocr_box(raw_box: Any, img_w: int, img_h: int) -> list[int]:
        if hasattr(raw_box, "tolist"):
            raw_box = raw_box.tolist()

        if not raw_box:
            return []

        if len(raw_box) == 4 and all(isinstance(value, (int, float)) for value in raw_box):
            x1, y1, x2, y2 = [float(value) for value in raw_box]
        else:
            points = []
            for point in raw_box:
                if hasattr(point, "tolist"):
                    point = point.tolist()
                if isinstance(point, (list, tuple)) and len(point) >= 2:
                    points.append((float(point[0]), float(point[1])))

            if not points:
                return []

            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            x1, y1, x2, y2 = min(xs), min(ys), max(xs), max(ys)

        return [
            max(0, min(img_w, int(round(x1)))),
            max(0, min(img_h, int(round(y1)))),
            max(0, min(img_w, int(round(x2)))),
            max(0, min(img_h, int(round(y2)))),
        ]

    @staticmethod
    def _first_present(payload: dict, keys: list[str]) -> Any:
        for key in keys:
            if key in payload and payload[key] is not None:
                return payload[key]
        return []

    @staticmethod
    def _safe_float(value: Any) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _detect_text_regions(img_bgr):
        h_img, w_img = img_bgr.shape[:2]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        _, thresh = cv2.threshold(
            gray, 0, 255,
            cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
        )

        # Remove horizontal grid lines
        hk    = cv2.getStructuringElement(cv2.MORPH_RECT, (w_img // 3, 1))
        horiz = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, hk, iterations=1)
        clean = cv2.subtract(thresh, horiz)

        # Remove vertical column dividers
        vk   = cv2.getStructuringElement(cv2.MORPH_RECT, (1, h_img // 5))
        vert = cv2.morphologyEx(clean, cv2.MORPH_OPEN, vk, iterations=1)
        clean = cv2.subtract(clean, vert)

        # Dilate to merge characters into text-line blobs
        dk      = cv2.getStructuringElement(cv2.MORPH_RECT, (50, 4))
        dilated = cv2.dilate(clean, dk, iterations=1)

        contours, _ = cv2.findContours(
            dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        boxes = []
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if w < 25:             continue
            if h < 10:             continue
            if h > 120:            continue
            if w > w_img * 0.95:   continue
            if w / h < 1.2:        continue
            x1 = max(0,     x - 4)
            y1 = max(0,     y - 4)
            x2 = min(w_img, x + w + 4)
            y2 = min(h_img, y + h + 4)
            boxes.append([x1, y1, x2, y2])

        boxes.sort(key=lambda b: (b[1] // 20, b[0]))
        return boxes

    # ------------------------------------------------------------------
    # Recognition
    # ------------------------------------------------------------------

    def _recognize_region(self, crop_bgr):
        img_tensor, _ = self.resizer(crop_bgr)
        img_input     = img_tensor[np.newaxis, ...]

        if self._paddle_available and self._predictor is not None:
            names  = self._predictor.get_input_names()
            handle = self._predictor.get_input_handle(names[0])
            handle.reshape(img_input.shape)
            handle.copy_from_cpu(img_input)
            self._predictor.run()
            out_names = self._predictor.get_output_names()
            out       = self._predictor.get_output_handle(out_names[0])
            logits    = out.copy_to_cpu()[0]
        else:
            logits = self._simulate_logits(crop_bgr)

        return self.decoder.decode(logits)

    def _simulate_logits(self, crop_bgr):
        """Dummy output for pipeline testing without PaddlePaddle."""
        T          = max(4, crop_bgr.shape[1] // 8)
        vocab_size = len(self.decoder.character_list) + 1
        rng        = np.random.default_rng(
            seed=int(crop_bgr.mean() * 1000) % (2 ** 31)
        )
        logits = rng.random((T, vocab_size)).astype(np.float32)
        for t in range(T):
            logits[t, rng.integers(0, vocab_size - 1)] += 3.0
        exp = np.exp(logits - logits.max(axis=1, keepdims=True))
        return exp / exp.sum(axis=1, keepdims=True)

    # ------------------------------------------------------------------
    # Field assignment
    # ------------------------------------------------------------------

    @staticmethod
    def _assign_field(text: str, bbox: list, img_h: int, img_w: int) -> str:
        text_l = text.lower().strip()
        rel_y  = bbox[1] / img_h
        mid_x  = (bbox[0] + bbox[2]) / 2 / img_w

        # Keyword match first
        for field, keywords in FIELD_KEYWORDS.items():
            for kw in keywords:
                if kw in text_l:
                    return field

        # Header section
        if rel_y < HEADER_END:
            if mid_x < HEADER_MID_X:
                for y_start, y_end, field in HEADER_ROWS:
                    if y_start <= rel_y < y_end:
                        return field
                return "Name"
            else:
                for y_start, y_end, field in HEADER_ROWS_RIGHT:
                    if y_start <= rel_y < y_end:
                        return field
                return "EPI Status"

        # Table header row
        if HEADER_END <= rel_y < TABLE_HDR_END:
            return "Table Header"

        # Table data rows — use horizontal position
        for x_start, x_end, field in TABLE_COLS:
            if x_start <= mid_x < x_end:
                return field

        return "Notes"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self, image_path: str) -> OCRResult:
        t0      = time.perf_counter()
        img_bgr = cv2.imread(str(image_path))
        if img_bgr is None:
            raise ValueError(f"Cannot read image: {image_path}")

        h, w = img_bgr.shape[:2]
        logger.info("Processing %s  [%dx%d]", image_path, w, h)

        if self._paddleocr_available and self._paddleocr_engine is not None:
            result = self._paddleocr_engine.predict(str(image_path))
            if self.pipeline == "hybrid" and self._paddle_available and self._predictor is not None:
                regions = self._extract_hybrid_regions(result, img_bgr, h, w)
                return self._build_result(image_path, regions, w, h, t0, "hybrid")

            regions = self._extract_paddleocr_regions(result, h, w)
            return self._build_result(image_path, regions, w, h, t0, "paddleocr")

        boxes = self._detect_text_regions(img_bgr)
        logger.info("Detected %d text regions", len(boxes))

        regions = []
        for bbox in boxes:
            x1, y1, x2, y2 = bbox
            crop = img_bgr[y1:y2, x1:x2]
            if crop.size == 0:
                continue
            text, conf = self._recognize_region(crop)
            if not text or len(text.strip()) < 1:
                continue
            if conf < 0.10:
                continue
            field = self._assign_field(text, bbox, h, w)
            regions.append(TextRegion(
                bbox=bbox, text=text,
                confidence=round(conf, 4), field=field,
            ))

        return self._build_result(image_path, regions, w, h, t0, "custom")

    def _build_result(self, image_path: str, regions: list[TextRegion], img_w: int, img_h: int, start_time: float, pipeline: str) -> OCRResult:
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        avg_conf   = float(np.mean([r.confidence for r in regions])) if regions else 0.0

        model_info = {
            **self.MODEL_INFO,
            "pipeline": pipeline,
            "detector": os.getenv("PADDLEOCR_DET_MODEL", "PP-OCRv5_server_det") if pipeline in {"paddleocr", "hybrid"} else "OpenCV contour detector",
            "recognizer": (
                f"{os.getenv('PADDLEOCR_REC_MODEL', 'PP-OCRv5_server_rec')} + {self.MODEL_INFO['model_name']}"
                if pipeline == "hybrid"
                else os.getenv("PADDLEOCR_REC_MODEL", "PP-OCRv5_server_rec")
                if pipeline == "paddleocr"
                else self.MODEL_INFO["model_name"]
            ),
        }
        if pipeline == "hybrid":
            model_info["custom_recognizer_regions"] = self._last_hybrid_custom_reads

        result = OCRResult(
            file_name=Path(image_path).name,
            recognized_text=[
                {"field": r.field, "value": r.text,
                 "confidence": r.confidence, "bbox": r.bbox}
                for r in regions
            ],
            processing_time_ms=round(elapsed_ms, 2),
            image_size=[img_w, img_h],
            total_regions=len(regions),
            avg_confidence=round(avg_conf, 4),
            model_info=model_info,
        )
        logger.info("Done %.1f ms | %d regions | avg_conf=%.3f",
                    elapsed_ms, len(regions), avg_conf)
        return result

    def validate(self, ocr_result: OCRResult, ground_truth: dict) -> dict:
        predictions = {}
        for item in ocr_result.recognized_text:
            field = item["field"]
            if field not in predictions or \
               item["confidence"] > predictions[field]["confidence"]:
                predictions[field] = item

        report = {
            "file":            ocr_result.file_name,
            "fields":          {},
            "exact_matches":   0,
            "partial_matches": 0,
            "misses":          0,
        }
        for field, expected in ground_truth.items():
            pred = predictions.get(field)
            if pred is None:
                report["fields"][field] = {
                    "status": "MISS", "expected": expected, "predicted": None
                }
                report["misses"] += 1
                continue
            got = pred["value"].strip().lower()
            exp = expected.strip().lower()
            if got == exp:
                status = "EXACT";   report["exact_matches"]   += 1
            elif exp in got or got in exp:
                status = "PARTIAL"; report["partial_matches"] += 1
            else:
                status = "MISS";    report["misses"]          += 1
            report["fields"][field] = {
                "status":     status,
                "expected":   expected,
                "predicted":  pred["value"],
                "confidence": pred["confidence"],
            }

        total = len(ground_truth)
        report["accuracy"] = round(
            (report["exact_matches"] + 0.5 * report["partial_matches"]) / total, 4
        ) if total else 0.0
        return report
