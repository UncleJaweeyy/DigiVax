#!/usr/bin/env python3
"""
cli_infer.py — Command-line interface for PP-OCRv5 medical form inference.

Usage:
    python3 cli_infer.py --image ./samples/medical_form.jpg \
                         --output ./results/output.json

    python3 cli_infer.py --image ./samples/form.jpg \
                         --model_dir ./model \
                         --dict_path ./model/custom_dict.txt \
                         --ground_truth '{"Patient Name":"Juan Dela Cruz","Date":"2026-05-12"}' \
                         --output ./results/output.json \
                         --log_level DEBUG
"""

import argparse
import json
import logging
import sys
from pathlib import Path

from ocr_engine import MedicalOCREngine


def parse_args():
    p = argparse.ArgumentParser(
        description="PP-OCRv5 Medical Form OCR — CLI",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument(
        "--image", required=True,
        help="Path to input .jpg medical form image",
    )
    p.add_argument(
        "--output", default="./results/output.json",
        help="Path to write JSON result file",
    )
    p.add_argument(
        "--model_dir", default="./model",
        help="Directory containing inference.json, .pdiparams, .pdiparams.info",
    )
    p.add_argument(
        "--dict_path", default="./model/custom_dict.txt",
        help="Path to character dictionary file",
    )
    p.add_argument(
        "--ground_truth", default=None,
        help='JSON string of expected field values for validation, e.g. '
             '\'{"Patient Name":"Juan Dela Cruz","Date":"2026-05-12"}\'',
    )
    p.add_argument(
        "--log_level", default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging verbosity",
    )
    p.add_argument(
        "--no_bbox", action="store_true",
        help="Omit bounding-box coordinates from output JSON",
    )
    return p.parse_args()


def setup_logging(level: str):
    logging.basicConfig(
        level=getattr(logging, level),
        format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def main():
    args = parse_args()
    setup_logging(args.log_level)
    log = logging.getLogger("cli_infer")

    # ── validate inputs ──────────────────────────────────────────────────
    image_path = Path(args.image)
    if not image_path.exists():
        log.error("Image not found: %s", image_path)
        sys.exit(1)
    if image_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".bmp"}:
        log.warning("Non-standard image extension: %s", image_path.suffix)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # ── load engine ──────────────────────────────────────────────────────
    try:
        engine = MedicalOCREngine(
            model_dir=args.model_dir,
            dict_path=args.dict_path,
        )
    except FileNotFoundError as exc:
        log.error("Model load failed: %s", exc)
        sys.exit(2)

    # ── run inference ────────────────────────────────────────────────────
    log.info("Running inference on: %s", image_path)
    result = engine.run(str(image_path))

    # optionally strip bboxes
    if args.no_bbox:
        for item in result.recognized_text:
            item.pop("bbox", None)

    payload = {
        "file_name": result.file_name,
        "recognized_text": result.recognized_text,
        "processing_time_ms": result.processing_time_ms,
        "image_size": result.image_size,
        "total_regions": result.total_regions,
        "avg_confidence": result.avg_confidence,
        "model_info": result.model_info,
    }

    # ── optional validation ───────────────────────────────────────────────
    if args.ground_truth:
        try:
            gt = json.loads(args.ground_truth)
            report = engine.validate(result, gt)
            payload["validation"] = report
            log.info(
                "Validation: exact=%d  partial=%d  miss=%d  accuracy=%.2f%%",
                report["exact_matches"], report["partial_matches"],
                report["misses"], report["accuracy"] * 100,
            )
        except json.JSONDecodeError as exc:
            log.error("Invalid ground_truth JSON: %s", exc)

    # ── write output ──────────────────────────────────────────────────────
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    log.info("Result saved → %s", output_path)

    # pretty-print summary to stdout
    print("\n" + "=" * 60)
    print(f"  File       : {result.file_name}")
    print(f"  Regions    : {result.total_regions}")
    print(f"  Avg conf.  : {result.avg_confidence:.3f}")
    print(f"  Time       : {result.processing_time_ms:.1f} ms")
    print("─" * 60)
    for item in result.recognized_text:
        field = item.get("field", "?")
        val   = item.get("value", "")
        conf  = item.get("confidence", 0.0)
        print(f"  [{field:18s}]  {val:<35s}  ({conf:.3f})")
    print("=" * 60 + "\n")

    if "validation" in payload:
        v = payload["validation"]
        print(f"  ACCURACY: {v['accuracy']*100:.1f}%  "
              f"(exact={v['exact_matches']}, partial={v['partial_matches']}, miss={v['misses']})\n")

    sys.exit(0)


if __name__ == "__main__":
    main()
