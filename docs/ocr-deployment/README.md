# DigiVax OCR Deployment Notes

This README explains how the Digitize File feature connects the Next.js app, Firebase App Hosting, Google Secret Manager, and the PaddleOCR Cloud Run service.

## Current Resources

Project:

```text
digivax-54700
```

Firebase App Hosting backend:

```text
digivax
https://digivax--digivax-54700.asia-southeast1.hosted.app
```

OCR Cloud Run service:

```text
digivax-ocr
https://digivax-ocr-6fntyewn7q-as.a.run.app
```

Secret Manager secret:

```text
digivaxOcrApiKey
```

The secret stores the OCR API key. Do not paste the secret value into Git, README files, screenshots, or chat.

## Required Tools And Dependencies

Use these versions or close equivalents when running the system locally.

Node and Next.js app:

```text
Node.js 20 or newer
npm
Firebase CLI
Google Cloud CLI
```

Install app dependencies from the repository root:

```powershell
npm install
```

Useful checks:

```powershell
node --version
npm --version
firebase --version
gcloud --version
```

OCR backend:

```text
Python 3.10 or 3.11
FastAPI
Uvicorn
PaddlePaddle CPU
PaddleOCR
```

The OCR Python dependencies live in:

```text
backend/ocr/requirements.txt
```

The Cloud Run container installs PaddlePaddle separately in:

```text
backend/ocr/Dockerfile
```

Local OCR setup is documented in:

```text
backend/ocr/README.md
```

## Important Local Files

These files are needed locally but should not be committed:

```text
.env.local
.python/
backend/ocr/.venv/
python-*-amd64.exe
firebase-debug.log
next-dev.log
```

These are already covered by `.gitignore`.

The committed environment checklist is:

```text
.env.example
```

Use `.env.example` as the template, then place real local values in `.env.local`.

## Firebase And Google Credentials

### Frontend Firebase Config

The browser-side Firebase values use `NEXT_PUBLIC_FIREBASE_*` variables. These are not private secrets, but they must match the Firebase project:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

### Firebase Admin SDK Locally

Server actions that use Firebase Admin need credentials when running outside Firebase App Hosting.

Recommended local setup:

```env
GOOGLE_APPLICATION_CREDENTIALS=C:/path/to/firebase-adminsdk-service-account.json
```

Alternative local setup:

```env
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

If using `FIREBASE_PRIVATE_KEY`, keep it as one line with `\n` between key lines.

### Service Account JSON

The Firebase service account JSON is sensitive. Treat it like a password.

Do:

- Keep it outside the repository, for example in `Downloads` or a private credential folder.
- Point to it with `GOOGLE_APPLICATION_CREDENTIALS` in `.env.local`.
- Rotate/delete it in Google Cloud IAM if it is exposed.

Do not:

- Commit the JSON file.
- Paste it into README files.
- Upload it in screenshots.
- Put it in `public/`.

For deployed Firebase App Hosting, you normally do not need a local JSON key. App Hosting runs with its managed service account.

### OCR API Key

The OCR API key is separate from Firebase credentials.

Local development reads:

```env
OCR_API_KEY=<local value>
```

Deployed App Hosting reads:

```yaml
secret: digivaxOcrApiKey
```

Cloud Run reads:

```text
OCR_API_KEY
```

The deployed App Hosting secret value and the Cloud Run `OCR_API_KEY` value must match. If they do not match, `/ocr` returns `401`.

## Google Cloud Project Access

The active project should be:

```powershell
gcloud config set project digivax-54700
```

The signed-in account needs enough permissions for:

- Firebase App Hosting deploys
- Cloud Run deploys
- Cloud Build builds
- Artifact Registry images
- Secret Manager secrets
- IAM permission grants for App Hosting service accounts

The APIs used by this setup are:

```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project digivax-54700
```

## How The Digitize Flow Works

1. A staff user uploads a JPG, PNG, or PDF in the DigiVax Digitize page.
2. The page sends the file to the Next.js server action in `actions/records/scan-actions.ts`.
3. The server action reads these runtime env variables:

```env
OCR_API_URL=https://digivax-ocr-6fntyewn7q-as.a.run.app/ocr
OCR_API_KEY=<from Secret Manager>
OCR_USE_MOCK=false
```

4. The server action calls the Cloud Run OCR service with:

```http
POST /ocr
Authorization: Bearer <OCR_API_KEY>
Content-Type: multipart/form-data
```

5. The OCR service returns extracted text and confidence.
6. DigiVax shows the extracted text for staff review before saving the record.

## Local Versus Deployed Environment

Local development reads `.env.local`.

Firebase App Hosting does not read your local `.env.local`. The deployed app only sees values configured in Firebase/App Hosting, currently through `apphosting.yaml`.

That is why Digitize can work locally but fail on the public deployed app if `OCR_API_URL`, `OCR_API_KEY`, and `OCR_USE_MOCK` are missing from the deployed runtime.

## App Hosting Runtime Config

The deployed Next.js app gets OCR runtime variables from `apphosting.yaml`:

```yaml
env:
  - variable: OCR_API_URL
    value: https://digivax-ocr-6fntyewn7q-as.a.run.app/ocr
    availability:
      - RUNTIME

  - variable: OCR_API_KEY
    secret: digivaxOcrApiKey
    availability:
      - RUNTIME

  - variable: OCR_USE_MOCK
    value: "false"
    availability:
      - RUNTIME
```

The API key is referenced by secret name only. The actual value lives in Google Secret Manager.

## Where To Find Secret Manager

Open Google Cloud Secret Manager:

```text
https://console.cloud.google.com/security/secret-manager?project=digivax-54700
```

Look for:

```text
digivaxOcrApiKey
```

Useful CLI checks:

```powershell
gcloud secrets list --project digivax-54700
gcloud secrets describe digivaxOcrApiKey --project digivax-54700
```

To inspect metadata only, use `describe`. Avoid printing the secret value unless you truly need it.

## Verify Cloud Run OCR

Check the OCR service health:

```powershell
Invoke-RestMethod https://digivax-ocr-6fntyewn7q-as.a.run.app/health
```

Expected response:

```json
{
  "status": "ok"
}
```

Check the deployed OCR service revision:

```powershell
gcloud run services describe digivax-ocr `
  --region asia-southeast1 `
  --project digivax-54700 `
  --format="value(status.latestReadyRevisionName,status.url)"
```

## Verify App Hosting Env

Check that the deployed Next.js service has the OCR variables:

```powershell
gcloud run services describe digivax `
  --region asia-southeast1 `
  --project digivax-54700 `
  --format=json
```

In the output, the container env should include:

```text
OCR_API_URL
OCR_API_KEY
OCR_USE_MOCK
FIREBASE_CONFIG
```

Do not expect to see the OCR API key value. It should be wired as a secret.

## Deploy OCR Backend

The PaddleOCR FastAPI service lives in:

```text
backend/ocr
```

Deploy it from the repository root:

```powershell
gcloud run deploy digivax-ocr `
  --source .\backend\ocr `
  --region asia-southeast1 `
  --allow-unauthenticated `
  --memory 4Gi `
  --cpu 2 `
  --timeout 900 `
  --concurrency 1 `
  --set-env-vars OCR_API_KEY=<same-key-as-secret-manager> `
  --project digivax-54700
```

The Cloud Run service is public, but `/ocr` requires the bearer API key when `OCR_API_KEY` is configured. `/health` remains public for basic uptime checks.

## Deploy App Hosting

After editing `apphosting.yaml`, deploy the Next.js backend:

```powershell
firebase deploy --only apphosting:digivax --project digivax-54700
```

After deploy, confirm the rollout finished and then test Digitize in the public app.

## Rotate OCR API Key

Use this sequence if the OCR API key must be changed.

1. Generate a new key.
2. Update the Cloud Run OCR service:

```powershell
gcloud run services update digivax-ocr `
  --region asia-southeast1 `
  --project digivax-54700 `
  --set-env-vars OCR_API_KEY=<new-key>
```

3. Add a new version to the Secret Manager secret:

```powershell
Set-Content -Path "$env:TEMP\digivax-ocr-api-key.txt" -Value "<new-key>" -NoNewline
firebase apphosting:secrets:set digivaxOcrApiKey `
  --data-file "$env:TEMP\digivax-ocr-api-key.txt" `
  --force `
  --project digivax-54700
Remove-Item "$env:TEMP\digivax-ocr-api-key.txt"
```

4. Redeploy App Hosting:

```powershell
firebase deploy --only apphosting:digivax --project digivax-54700
```

5. Test `/health`, then test Digitize in the deployed app.

## Troubleshooting

If Digitize works locally but not online:

- Check `apphosting.yaml` has `OCR_API_URL`, `OCR_API_KEY`, and `OCR_USE_MOCK`.
- Redeploy App Hosting after editing `apphosting.yaml`.
- Confirm the deployed `digivax` Cloud Run service has the OCR env variables.
- Confirm `digivaxOcrApiKey` exists in Secret Manager.
- Confirm the App Hosting service account can access the secret.
- Confirm `https://digivax-ocr-6fntyewn7q-as.a.run.app/health` returns `ok`.

If OCR returns `401`:

- The App Hosting secret value and Cloud Run `OCR_API_KEY` value do not match.
- Rotate both values using the same key.

If OCR returns `503` or crashes:

- Check Cloud Run logs for `digivax-ocr`.
- The current backend disables Paddle's unstable Cloud Run CPU acceleration flags in `backend/ocr/server.py` and `backend/ocr/Dockerfile`.
- Redeploy `digivax-ocr` after backend changes.

If the public app still uses old behavior:

- Wait for App Hosting rollout to complete.
- Hard refresh the browser.
- Confirm you are opening the App Hosting URL, not an older preview or stale localhost tab.
