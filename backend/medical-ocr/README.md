# DigiVax Medical OCR Backend

This backend contains the developer-provided PP-OCRv5 medical form OCR package adapted for DigiVax.

It is separate from `backend/ocr`, which is the default PaddleOCR demo service currently deployed. Keep this service separate until it has been tested and you are ready to switch `OCR_API_URL`.

## What Is Included

```text
api_server.py          FastAPI API with original /predict and DigiVax /ocr endpoints
ocr_engine.py          Medical OCR engine with PaddleOCR PP-OCRv5 pipeline and custom fallback
cli_infer.py           CLI runner for local image tests
Dockerfile             Cloud Run container definition
requirements.txt       Python dependencies installed after PaddlePaddle
model/                 Trained Paddle inference model
```

Model files:

```text
model/inference.json
model/inference.pdiparams
model/inference.yml
model/custom_dict.txt
```

Do not copy the original `.venv`, `__pycache__`, large training folders, or thesis backup datasets into this backend.

## Endpoints

Health check:

```http
GET /health
```

Original developer API:

```http
POST /predict
Authorization: Bearer <OCR_API_KEY, if configured>
Content-Type: multipart/form-data

file=<medical form image>
```

DigiVax-compatible API:

```http
POST /ocr
Authorization: Bearer <OCR_API_KEY, if configured>
Content-Type: multipart/form-data

file=<medical form image>
```

The `/ocr` endpoint returns:

```json
{
  "text": "Name: Juan Dela Cruz\nOther CC: BCG",
  "confidence": 0.91,
  "fields": {
    "patientName": "Juan Dela Cruz",
    "vaccineType": "BCG",
    "vaccinationDate": "2026-05-12"
  },
  "raw": {
    "recognized_text": []
  }
}
```

The current DigiVax Next.js app only requires `text`. `confidence` and `fields` are optional but useful.

For a PaddleOCR-style demo response, `/ocr` also supports:

```text
POST /ocr?include_markdown=true&include_visualization=true
```

`include_markdown` is enabled by default and returns a Markdown table of detected regions. `include_visualization` is disabled by default because it adds a base64 PNG overlay to the JSON response.

Extra response fields:

```json
{
  "markdown": "# OCR Result...",
  "clinicRecord": {
    "patient": {},
    "vaccines": [],
    "visits": []
  },
  "visualization": {
    "mimeType": "image/png",
    "dataUrl": "data:image/png;base64,...",
    "boxes": []
  }
}
```

## Supported File Types

This service currently supports image files:

```text
JPG
JPEG
PNG
BMP
```

PDF is not supported in this custom medical OCR backend yet because the engine reads images with OpenCV. If PDF support is required, add a first-page PDF-to-image conversion step before calling the OCR engine.

## Local Run

Use Python 3.10 or the same runtime used by the Paddle Docker image.

Install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install paddlepaddle==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
python -m pip install -r requirements.txt
```

The default local and Docker path uses PaddleOCR's stronger PP-OCRv5 server detector/recognizer:

```powershell
$env:MEDICAL_OCR_PIPELINE="paddleocr"
$env:PADDLEOCR_DET_MODEL="PP-OCRv5_server_det"
$env:PADDLEOCR_REC_MODEL="PP-OCRv5_server_rec"
```

For a lighter Cloud Run demo, switch to mobile models:

```powershell
$env:PADDLEOCR_DET_MODEL="PP-OCRv5_mobile_det"
$env:PADDLEOCR_REC_MODEL="en_PP-OCRv5_mobile_rec"
```

To force the older custom recognizer fallback:

```powershell
$env:MEDICAL_OCR_PIPELINE="custom"
```

Run:

```powershell
uvicorn api_server:app --host 127.0.0.1 --port 8080
```

If the Windows Paddle predictor crashes while loading the exported model, run a contract-only local test with simulation mode:

```powershell
$env:MEDICAL_OCR_DISABLE_PADDLE="1"
uvicorn api_server:app --host 127.0.0.1 --port 8080
```

Simulation mode proves the API wiring, but it does not prove real OCR quality. Test the real model in the Linux Docker/Cloud Run environment before switching production traffic.

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/health
```

## Cloud Run Deploy

Deploy as a separate service first:

```powershell
gcloud run deploy digivax-medical-ocr `
  --source .\backend\medical-ocr `
  --region asia-southeast1 `
  --allow-unauthenticated `
  --memory 4Gi `
  --cpu 2 `
  --timeout 900 `
  --concurrency 1 `
  --set-env-vars OCR_API_KEY=<same-key-as-secret-manager> `
  --project digivax-54700
```

After deployment, test:

```powershell
Invoke-RestMethod https://YOUR-MEDICAL-OCR-URL/health
```

Only switch the DigiVax frontend after `/ocr` has been tested with real uploaded records:

```env
OCR_API_URL=https://YOUR-MEDICAL-OCR-URL/ocr
OCR_API_KEY=<same-key-as-secret-manager>
OCR_USE_MOCK=false
```

For deployed Firebase App Hosting, update `apphosting.yaml` and redeploy:

```powershell
firebase deploy --only apphosting:digivax --project digivax-54700
```

## Notes

- The Dockerfile installs `paddlepaddle==3.2.0` because the exported model is PIR-format.
- The default runtime path is `MEDICAL_OCR_PIPELINE=paddleocr`, using `PP-OCRv5_server_det` and `PP-OCRv5_server_rec`.
- The server models are more accurate but heavier; increase Cloud Run memory/CPU if cold starts or inference time become an issue.
- Set `MEDICAL_OCR_PIPELINE=custom` to force the older OpenCV-region detector plus custom recognition model fallback.
- The Cloud Run service is public for reachability, but inference endpoints require `OCR_API_KEY` when configured.
- `/health` is intentionally public.
- Keep the model artifacts in `model/`; the service validates those paths on startup.
- This service is tuned for Under Five Clinic Record style forms, not generic vaccination cards.
