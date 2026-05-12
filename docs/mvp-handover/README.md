# DigiVax MVP Handover Documentation

This document explains the current DigiVax MVP from a code handover perspective. It describes what is implemented, where the important files live, how the main workflows run, and what a future developer should be careful with.

## MVP Summary

DigiVax is a Firebase-backed Next.js app for digitizing vaccination record files, reviewing OCR output, saving structured vaccination records, searching saved records, and managing staff access.

The MVP includes:

- Email/password login through Firebase Authentication.
- Role-based access for `admin` and `bhw` staff profiles stored in Firestore.
- Browser-session persistence with auto logout after 8 hours or 30 minutes of inactivity.
- Digitize File workflow using a PaddleOCR FastAPI backend deployed to Cloud Run.
- Firebase Storage upload for original vaccination scan files.
- Firestore storage for extracted/reviewed vaccination records.
- Search and record-review workflow.
- Admin dashboard with live counts and recent activity.
- Staff management for creating, enabling, disabling, and resetting staff accounts.
- Audit logs for important staff/admin actions.
- Firebase App Hosting deployment for the Next.js app.
- Cloud Run deployment for the OCR backend.

## Technology Stack

Frontend and server app:

```text
Next.js 16.2.6
React 19.2.3
TypeScript
Tailwind CSS 4
Firebase Web SDK
Firebase Admin SDK
Lucide React icons
```

Backend OCR service:

```text
FastAPI
Uvicorn
PaddlePaddle CPU
PaddleOCR
Google Cloud Run
```

Firebase and Google Cloud:

```text
Firebase Authentication
Cloud Firestore
Firebase Storage
Firebase App Hosting
Google Cloud Run
Google Cloud Secret Manager
Cloud Build
Artifact Registry
```

## Repository Layout

```text
app/                         Next.js App Router pages, layouts, and API routes
actions/                     Server actions and feature actions
components/                  Shared UI, layout, auth, and dashboard components
lib/                         Firebase clients, helpers, parsers, session utilities
types/                       Shared TypeScript types
backend/ocr/                 FastAPI PaddleOCR backend for Cloud Run
backend/medical-ocr/         Developer-provided custom PP-OCRv5 medical OCR backend
docs/ocr-deployment/         OCR and deployment operations notes
docs/mvp-handover/           This handover document
firebase.json                Firebase deploy target configuration
apphosting.yaml              Firebase App Hosting runtime and env config
firestore.rules              Firestore security rules
storage.rules                Firebase Storage security rules
.env.example                 Local environment variable checklist
```

## Application Routes

### Public/Auth Routes

`app/page.tsx`

Redirect-style landing route. It points users toward login.

`app/(auth)/login/page.tsx`

Login page for Firebase email/password authentication. It also handles first-login password change when a staff profile has `forcePasswordChange: true`.

### Staff/BHW Routes

`app/(features)/(main)/dashboard/page.tsx`

BHW dashboard. Shows record counts and recent vaccination records from Firestore.

`app/(features)/digitalize/page.tsx`

Digitize File page. Lets staff upload a JPG, PNG, JPEG, or PDF, sends it to OCR, displays extracted text, allows manual correction, uploads the source file, and saves the reviewed record. When the custom medical OCR backend returns PP-OCRv5-style extras, this page opens an editable Under Five Clinic Record review modal with patient details, EPI/vaccine fields, and the Findings / Chief Complaint table.

`components/records/ClinicRecordReviewModal.tsx`

Editable clinic-format review modal used by the Digitize File page. It displays the OCR/source image with direct editable controls over the form, keeps the structured fields synchronized, and converts table edits back into corrected OCR text.

`lib/records/clinic-format.ts`

Converts between structured clinic records and the corrected text blob used by existing search/dashboard parsing.

`app/(features)/search/page.tsx`

Search and review page. Lists saved vaccination records, supports client-side filtering over the latest records, opens details, edits corrected OCR text, marks records as completed, exports record text, and opens uploaded source files.

### Admin Routes

`app/(features)/admin/dashboard/page.tsx`

Admin dashboard. Shows live staff/record/storage statistics and recent activity. Also supports CSV exports and audit-log flushing.

`app/(features)/admin/users/page.tsx`

Manage Staff page. Admins can create staff accounts, activate/disable users, and reset passwords.

`app/(features)/admin/logs/page.tsx`

System Logs page. Admins can search, filter, export, and review audit logs.

### API Routes

`app/api/audit/route.ts`

Protected endpoint used by client-side workflows to write audit logs. It verifies the Firebase ID token and checks the Firestore user profile before writing.

`app/api/records/source/route.ts`

Protected endpoint for opening uploaded source files from Firebase Storage. It verifies staff access, loads the record, reads the storage object with Admin SDK privileges, and streams it back to the browser.

## Authentication And Access Control

### Firebase Client Setup

`lib/firebase/client.ts`

Initializes the browser Firebase app, Auth, Firestore, and Storage.

Important behavior:

- Requires the `NEXT_PUBLIC_FIREBASE_*` environment values.
- Fails early if required Firebase browser config is missing.
- Enables Firestore persistent local cache with multi-tab support for basic offline reads and queued writes.

### Firebase Admin Setup

`lib/firebase/admin.ts`

Initializes the Firebase Admin SDK for server-only code.

Credential behavior:

- Uses `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` if provided locally.
- Otherwise uses Application Default Credentials.
- On Firebase App Hosting, the runtime service account provides credentials automatically.
- Provides clearer local error messaging when Admin credentials are missing.

### Role Checks

`lib/firebase/admin-access.ts`

Server-side access helper for privileged actions.

Functions:

- `assertActiveStaff(idToken)` allows active `admin` or `bhw` users.
- `assertAdmin(idToken)` allows only active admins.

Both functions verify the Firebase ID token, then read `users/{uid}` in Firestore to confirm role and status.

### Client Auth State

`components/auth/AuthProvider.tsx`

Provides the current Firebase user and DigiVax profile to the client app.

Important behavior:

- Uses browser-session persistence, so the session ends when the browser session closes.
- Tracks session timestamps in `sessionStorage`.
- Auto logs out after 8 hours absolute session time.
- Auto logs out after 30 minutes of inactivity.
- Refreshes the Firestore user profile through `refreshProfile()`.

`lib/auth/session.ts`

Contains the timestamp keys, activity events, and expiry calculation used by `AuthProvider`.

`components/auth/AuthGuard.tsx`

Protects feature routes.

Rules:

- Unauthenticated users go to `/login`.
- Inactive users go to `/login`.
- Non-admin users cannot access `/admin/*` routes.

## User And Staff Data

### Firestore Collection

```text
users/{uid}
```

Expected fields:

```json
{
  "uid": "AUTH_USER_UID",
  "name": "BHW Juan Dela Cruz",
  "email": "staff@example.com",
  "role": "bhw",
  "status": "Active",
  "forcePasswordChange": true,
  "joined": "2026-05-10",
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

Allowed roles:

```text
admin
bhw
```

Allowed statuses:

```text
Active
Pending
Disabled
```

### Staff Management Files

`actions/admin/user-actions.ts`

Admin-only server actions for:

- Listing staff profiles.
- Creating Firebase Auth users.
- Creating matching Firestore `users/{uid}` profiles.
- Enabling/disabling users.
- Resetting passwords and setting `forcePasswordChange: true`.

`lib/firebase/users.ts`

Client-side helper for:

- Reading the current user's Firestore profile.
- Marking `forcePasswordChange` as false after first password change.
- Creating a pending fallback profile if a Firebase Auth user exists without a DigiVax profile.

## Digitize File Workflow

Primary page:

```text
app/(features)/digitalize/page.tsx
```

Main workflow:

1. Staff selects or drops a file.
2. The page sends the file to `processScan()`.
3. `processScan()` calls the OCR backend through `OCR_API_URL`.
4. Extracted OCR text is shown in an editable review box.
5. If structured medical OCR is available, staff can correct the clinic-format modal table.
6. The original file uploads to Firebase Storage.
7. The reviewed text, parsed fields, and optional `clinicRecord` object save to Firestore.
8. An audit log is written.

### OCR Server Action

`actions/records/scan-actions.ts`

Accepts:

```text
image/jpeg
image/jpg
image/png
application/pdf
```

Environment variables:

```env
OCR_API_URL=
OCR_API_KEY=
OCR_USE_MOCK=false
```

Behavior:

- If `OCR_API_URL` is configured, sends the file to the OCR backend as multipart form-data.
- If `OCR_API_KEY` is set, sends `Authorization: Bearer <key>`.
- If `OCR_API_URL` is missing and `OCR_USE_MOCK=true`, returns mock extracted text for demos.
- If neither OCR API nor mock mode is available, returns a clear configuration error.

### OCR Backend

`backend/ocr/server.py`

FastAPI service with:

- `GET /health`
- `POST /ocr`

Important behavior:

- Validates content type.
- Optionally requires bearer API key through `OCR_API_KEY`.
- Lazily initializes PaddleOCR on the first OCR request.
- Uses lighter mobile OCR models for Cloud Run compatibility.
- Disables unstable Paddle CPU acceleration flags that caused Cloud Run crashes.

`backend/ocr/Dockerfile`

Builds the Cloud Run container.

`backend/ocr/requirements.txt`

Python dependencies for FastAPI, Uvicorn, multipart uploads, and PaddleOCR.

Detailed OCR deployment notes:

```text
docs/ocr-deployment/README.md
```

`backend/medical-ocr/`

Custom developer-provided medical OCR package. It defaults to a hybrid OCR pipeline: PaddleOCR's PP-OCRv5 server detector locates text boxes, then the included custom fine-tuned Paddle recognizer re-reads detected crops where useful. Its DigiVax-compatible `/ocr` endpoint returns text, structured clinic-record fields, Markdown, and an optional overlay image. Keep it deployed separately from `backend/ocr` until it has been tested with real records and you are ready to switch `OCR_API_URL`.

## Vaccination Record Storage

### Firestore Collection

```text
vaccinationRecords/{recordId}
```

Expected fields:

```json
{
  "patientName": "Juan Dela Cruz",
  "patientNameLower": "juan dela cruz",
  "vaccineType": "Pfizer",
  "vaccineTypeLower": "pfizer",
  "vaccinationDate": "2023-08-15",
  "recordYear": "2023",
  "rawText": "Original OCR output",
  "correctedText": "User-reviewed OCR output",
  "clinicRecord": {
    "patient": {},
    "vaccines": [],
    "visits": []
  },
  "status": "Pending Review",
  "sourceFileName": "scan.png",
  "sourceFileType": "image/png",
  "sourceStoragePath": "vaccination-records/AUTH_USER_UID/scan.png",
  "searchKeywords": ["juan", "dela", "cruz", "pfizer", "2023"],
  "createdBy": "AUTH_USER_UID",
  "createdByName": "BHW Juan Dela Cruz",
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

Allowed record statuses:

```text
Pending Review
Completed
```

### Record Helpers

`lib/firebase/records.ts`

Client-side Firestore helper for:

- Creating vaccination records.
- Reading the latest 100 records.
- Reading a single record.
- Updating corrected OCR text.
- Marking records as completed.
- Writing client audit logs after changes.

`lib/records/parser.ts`

Temporary parser used until the full research/ML pipeline is connected.

Current extraction method:

- Regex for patient name.
- Regex for vaccine type.
- Regex for vaccination date.
- Year extraction from the date/text.
- Search keyword generation.

Known limitation:

- This is not the final TF-IDF/SVM or BioBERT pipeline from the manuscript. It is a stable MVP parser so saved records have structured fields.

## File Uploads And Source Preview

`lib/firebase/storage.ts`

Handles browser uploads and source-file preview requests.

Upload behavior:

- Requires signed-in Firebase user.
- Allows JPG, JPEG, PNG, and PDF.
- Enforces 10 MB max file size.
- Saves under:

```text
vaccination-records/{uid}/{timestamp}-{safeFileName}
```

Source preview behavior:

- Browser requests `/api/records/source?recordId=...`.
- API route verifies ID token and staff status.
- Server uses Firebase Admin Storage access to fetch the object.
- Browser receives a blob URL for viewing/downloading.

`storage.rules`

Allows signed-in users to create/read their own files under `vaccination-records/{uid}/...`. Updates and deletes are denied from the client.

## Search And Review Workflow

Primary page:

```text
app/(features)/search/page.tsx
```

Features:

- Lists recent records from Firestore.
- Client-side search over visible records.
- Opens record detail panel.
- Shows parsed patient/vaccine/date/status metadata.
- Shows raw OCR and corrected text.
- Allows staff to edit corrected text.
- Re-parses edited text and updates Firestore fields.
- Can mark record as `Completed`.
- Can export a single record text file.
- Can open the uploaded source file through the protected source API route.

Important helper:

```text
lib/firebase/records.ts
```

## Dashboards

### BHW Dashboard

`app/(features)/(main)/dashboard/page.tsx`

Uses:

```text
actions/bhw/dashboard-actions.ts
```

Shows:

- Total recent records.
- Completed records.
- Pending review records.
- Recent activity table.

### Admin Dashboard

`app/(features)/admin/dashboard/page.tsx`

Uses:

```text
actions/admin/dashboard-actions.ts
```

Shows:

- Total staff.
- Pending access.
- Uploaded source files.
- Recent activity.

Admin actions:

- Export all vaccination records as CSV.
- Export session/audit logs as CSV.
- Flush audit logs.

All admin dashboard actions require `assertAdmin(idToken)`.

## Audit Logs

### Firestore Collection

```text
auditLogs/{logId}
```

Expected fields:

```json
{
  "userId": "AUTH_USER_UID",
  "user": "BHW Juan Dela Cruz",
  "action": "Digitalized Record",
  "target": "Juan Dela Cruz",
  "targetId": "record id",
  "status": "success",
  "createdAt": "server timestamp"
}
```

Allowed log statuses:

```text
success
warning
error
```

### Audit Helpers

`lib/firebase/audit-log.ts`

Server-side Admin SDK writer and mapper for audit logs.

`lib/firebase/audit-client.ts`

Client helper that sends audit-log requests to `/api/audit` with the current user's Firebase ID token.

`app/api/audit/route.ts`

Protected API route that validates the token and active staff profile before writing audit logs.

`actions/admin/log-actions.ts`

Admin server action for reading/filtering logs. Falls back to recent vaccination record activity if no audit log documents exist yet.

## Shared Components

`components/layout/Sidebar.tsx`

Role-aware navigation. Admins see admin-only links. BHW users see staff workflow links.

`components/layout/Topbar.tsx`

Small top bar used inside authenticated layouts.

`components/auth/AuthProvider.tsx`

Global auth/profile/session provider.

`components/auth/AuthGuard.tsx`

Route protection wrapper for authenticated feature layouts.

`components/dashboard/StatCard.tsx`

Reusable dashboard statistic card.

`components/dashboard/RecentTable.tsx`

Reusable recent activity table for BHW/admin dashboards.

`components/ui/Button.tsx`

Shared button styling.

## Shared Types

`types/user.ts`

Staff roles, statuses, and staff profile shape.

`types/records.ts`

Vaccination record list/detail/document/input types.

`types/log.ts`

Audit/system log status, type filters, date filters, and log shape.

`types/dashboard.ts`

Dashboard stat card data shape.

## Environment Variables

Local development uses:

```text
.env.local
```

Template:

```text
.env.example
```

Important variables:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

GOOGLE_APPLICATION_CREDENTIALS=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

OCR_API_URL=
OCR_API_KEY=
OCR_USE_MOCK=false
```

Rules:

- `NEXT_PUBLIC_FIREBASE_*` values are browser config and must match the Firebase project.
- `GOOGLE_APPLICATION_CREDENTIALS` points to a local Firebase service account JSON for Admin SDK local development.
- Service account JSON files must not be committed.
- `OCR_API_KEY` must match the key configured on the OCR Cloud Run service.
- Firebase App Hosting does not read `.env.local`; deployed runtime values are configured in `apphosting.yaml`.

## Deployment Files

`firebase.json`

Defines Firebase deploy targets:

- App Hosting backend `digivax`
- Firestore rules
- Storage rules

`apphosting.yaml`

Defines Firebase App Hosting runtime resources and OCR environment variables.

Current runtime config:

```text
cpu: 1
memoryMiB: 512
concurrency: 80
maxInstances: 10
```

Current OCR runtime variables:

```text
OCR_API_URL
OCR_API_KEY from Secret Manager
OCR_USE_MOCK=false
```

`firestore.rules`

Firestore client security rules.

`storage.rules`

Storage client security rules for vaccination source files.

## Local Development

Install dependencies:

```powershell
npm install
```

Start the Next.js app:

```powershell
npm run dev
```

Run lint:

```powershell
npm run lint
```

Build:

```powershell
npm run build
```

Run local OCR backend:

```powershell
cd backend\ocr
.\.venv\Scripts\Activate.ps1
uvicorn server:app --host 127.0.0.1 --port 8000
```

If PowerShell blocks activation:

```powershell
.\.venv\Scripts\python.exe -m uvicorn server:app --host 127.0.0.1 --port 8000
```

Set local OCR env:

```env
OCR_API_URL=http://127.0.0.1:8000/ocr
OCR_API_KEY=
OCR_USE_MOCK=false
```

Restart `npm run dev` after changing `.env.local`.

## Deployment Commands

Deploy Firebase App Hosting:

```powershell
firebase deploy --only apphosting:digivax --project digivax-54700
```

Deploy Firestore rules:

```powershell
firebase deploy --only firestore --project digivax-54700
```

Deploy Storage rules:

```powershell
firebase deploy --only storage --project digivax-54700
```

Deploy OCR Cloud Run backend:

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

More OCR deployment details:

```text
docs/ocr-deployment/README.md
```

## Security Notes

Do not commit:

- `.env.local`
- Firebase service account JSON files
- `FIREBASE_PRIVATE_KEY` values
- OCR API keys
- local Python runtimes
- virtual environments
- debug logs

Important controls:

- Firebase Auth proves identity.
- Firestore `users/{uid}` proves DigiVax role and account status.
- Admin server actions use Firebase Admin SDK and explicit role checks.
- Client uploads are constrained by Storage rules and upload validation.
- Source-file reads go through a protected server route.
- The OCR Cloud Run service is public for network reachability but `/ocr` requires the configured bearer API key.

## Known MVP Limitations

The MVP is demo-ready but not the full research system from the manuscript.

Current limitations:

- OCR uses default PaddleOCR through FastAPI, not a custom-trained OCR pipeline.
- Text parsing uses regex-based extraction, not TF-IDF/SVM classification.
- BioBERT retrieval is not connected.
- Evaluation metrics are not implemented in the app.
- Search is lightweight and client-side over the latest fetched records.
- Firestore offline persistence is enabled, but there is no full conflict-resolution UX.
- PDF OCR support may vary by PaddleOCR environment; JPG/PNG are the most reliable demo path.

These limitations are acceptable for an MVP/demo but should be listed clearly in research or production handoff materials.

## Common Troubleshooting

Digitize works locally but not deployed:

- Check App Hosting runtime env in `apphosting.yaml`.
- Confirm Secret Manager has `digivaxOcrApiKey`.
- Confirm OCR Cloud Run `/health` returns `ok`.
- Redeploy App Hosting after changing `apphosting.yaml`.

Firebase Admin credentials fail locally:

- Set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON path, or
- Set `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`, or
- Run `gcloud auth application-default login`.

Storage upload says unauthorized:

- Confirm the signed-in user UID matches the storage path owner.
- Confirm `storage.rules` are deployed.
- Confirm the user has an active Firestore profile.

Admin page redirects or denies access:

- Confirm `users/{uid}.role` is `admin`.
- Confirm `users/{uid}.status` is `Active`.
- Confirm the Firebase Auth user is not disabled.

OCR returns `401`:

- Cloud Run `OCR_API_KEY` and Secret Manager `digivaxOcrApiKey` do not match.

OCR returns `503`:

- Check Cloud Run logs for `digivax-ocr`.
- Redeploy after changes to `backend/ocr/server.py` or `backend/ocr/Dockerfile`.

## Handover Checklist

Developer Notes:

- Confirm `.env.example` is up to date.
- Confirm no `.env.local` or service account JSON is committed.
- Confirm `apphosting.yaml` has OCR runtime variables.
- Confirm `digivaxOcrApiKey` exists in Secret Manager.
- Confirm Cloud Run `digivax-ocr` health endpoint works.
- Confirm Firebase App Hosting rollout is current.
- Confirm Firestore and Storage rules are deployed.
- Confirm at least one admin user exists in Firebase Auth and Firestore `users/{uid}`.
- Run `npm run lint`.
- Run `npm run build`.
- Test login, digitize, save, search, open source file, and admin logs.
