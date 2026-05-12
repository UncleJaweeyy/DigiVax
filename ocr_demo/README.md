# Local PaddleOCR Demo API

This folder provides a small FastAPI wrapper around default PaddleOCR so the DigiVax frontend can call it through `OCR_API_URL`.

## Setup

Install Python 3.10 or 3.11 first. Then run these commands from this folder:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install paddlepaddle==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
python -m pip install -r requirements.txt
```

The first OCR request downloads PaddleOCR model files, so expect it to be slower.

## Run

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn server:app --host 127.0.0.1 --port 8000
```

Then set this in the Next.js `.env.local`:

```env
OCR_API_URL=http://127.0.0.1:8000/ocr
OCR_API_KEY=
OCR_USE_MOCK=false
```

Restart `npm run dev` after changing `.env.local`.

## Notes

Use JPG or PNG files for the most reliable demo path. The DigiVax app allows PDFs, but default PaddleOCR support varies by environment and installed extras.

## Deploy to Cloud Run

Use Google Cloud Shell, or install the Google Cloud CLI locally. From the repository root:

```powershell
gcloud auth login
gcloud config set project digivax-54700
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

Deploy from the `ocr_demo` source folder. Cloud Run will build the Dockerfile with Cloud Build:

```powershell
gcloud run deploy digivax-ocr `
  --source .\ocr_demo `
  --region asia-southeast1 `
  --allow-unauthenticated `
  --memory 4Gi `
  --cpu 2 `
  --timeout 900 `
  --concurrency 1 `
  --set-env-vars OCR_API_KEY=change-this-demo-key
```

Copy the service URL printed by the command, then set the frontend environment:

```env
OCR_API_URL=https://YOUR-CLOUD-RUN-URL/ocr
OCR_API_KEY=change-this-demo-key
OCR_USE_MOCK=false
```

For Firebase App Hosting, add the same `OCR_API_URL`, `OCR_API_KEY`, and `OCR_USE_MOCK=false` values to the App Hosting backend environment so server actions can call Cloud Run.
