# Local PaddleOCR Demo API

This folder provides a small FastAPI wrapper around default PaddleOCR so the DigiVax frontend can call it through `OCR_API_URL`.

## Setup

Install Python 3.10 or 3.11 first. Then run these commands from `backend/ocr`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install paddlepaddle==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
python -m pip install -r requirements.txt
```

If PowerShell blocks script activation, use the virtual environment's Python directly:

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install paddlepaddle==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The first OCR request downloads PaddleOCR model files, so expect it to be slower.

## Run

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn server:app --host 127.0.0.1 --port 8000
```

If activation is blocked:

```powershell
.\.venv\Scripts\python.exe -m uvicorn server:app --host 127.0.0.1 --port 8000
```

Check the API is reachable:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
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

Use Google Cloud Shell, or install the Google Cloud CLI locally.

### PowerShell

```powershell
gcloud auth login
gcloud config set project digivax-54700
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

Deploy from the repository root. Cloud Run will build the Dockerfile in `backend/ocr` with Cloud Build:

```powershell
gcloud run deploy digivax-ocr `
  --source .\backend\ocr `
  --region asia-southeast1 `
  --allow-unauthenticated `
  --memory 4Gi `
  --cpu 2 `
  --timeout 900 `
  --concurrency 1 `
  --set-env-vars OCR_API_KEY=change-this-demo-key
```

### Google Cloud Shell

```bash
gcloud config set project digivax-54700
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

Deploy from the repository root:

```bash
gcloud run deploy digivax-ocr \
  --source ./backend/ocr \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --memory 4Gi \
  --cpu 2 \
  --timeout 900 \
  --concurrency 1 \
  --set-env-vars OCR_API_KEY=change-this-demo-key
```

Copy the service URL printed by the command, then set the frontend environment:

```env
OCR_API_URL=https://YOUR-CLOUD-RUN-URL/ocr
OCR_API_KEY=change-this-demo-key
OCR_USE_MOCK=false
```

Check the deployed API before connecting the frontend:

```bash
curl https://YOUR-CLOUD-RUN-URL/health
```

The first Cloud Run OCR request may be slow while PaddleOCR downloads and warms model files.

For Firebase App Hosting, add these values to the App Hosting backend environment so server actions can call Cloud Run:

```env
OCR_API_URL=https://YOUR-CLOUD-RUN-URL/ocr
OCR_API_KEY=change-this-demo-key
OCR_USE_MOCK=false
```
