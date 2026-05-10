This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Firebase App Hosting

This app is prepared for [Firebase App Hosting](https://firebase.google.com/docs/app-hosting), Firebase's hosting option for modern full-stack Next.js apps.

1. Push this repository to GitHub.
2. In the Firebase console, go to **Build > App Hosting** and create a backend.
3. Connect the GitHub repository, set the app root directory to `/`, and set the live branch you want to deploy from.
4. Keep automatic rollouts enabled so each push to the live branch deploys the app.

The root `apphosting.yaml` file configures the Cloud Run resources used by App Hosting. Firebase will detect Next.js from `package-lock.json` and run `npm run build` during rollout.

For local source deployments with the Firebase CLI:

```bash
firebase deploy --only apphosting:digivax
```

## Firebase Auth Setup

DigiVax uses Firebase Email/Password Auth for sign-in and Firestore user profile documents for app-specific access control.

Enable **Authentication > Sign-in method > Email/Password** in the Firebase console, then create staff users in **Authentication > Users**. For each Auth user, create a Firestore document at `users/{uid}`:

```json
{
  "uid": "AUTH_USER_UID",
  "name": "Staff Name",
  "email": "staff@example.com",
  "role": "admin",
  "status": "Active",
  "forcePasswordChange": true,
  "joined": "2026-05-10"
}
```

Valid roles are `admin` and `bhw`. Valid statuses are `Active`, `Pending`, and `Disabled`. Set `forcePasswordChange` to `true` for temporary passwords.

The local Firebase client config lives in `.env.local` and the same public values are included in `apphosting.yaml` for App Hosting builds. When handing this project off, use `.env.example` as the checklist for local setup.

## Admin User Management

The **Manage Staff** page uses server actions backed by the Firebase Admin SDK. Admin actions verify the signed-in user's Firebase ID token, check `users/{uid}` for `role: "admin"` and `status: "Active"`, then perform privileged Auth and Firestore work on the server.

Supported admin operations:

- List staff profiles from Firestore `users`.
- Create Firebase Auth users and matching `users/{uid}` profile documents.
- Enable, disable, or mark staff accounts pending.
- Reset a staff password and set `forcePasswordChange: true`.

Firebase App Hosting provides the server credentials needed by the Admin SDK. For local development outside App Hosting, use Application Default Credentials or set `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` in your local environment.

## Firestore Data Model

Digitized vaccination records are stored in `vaccinationRecords/{recordId}`:

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
  "status": "Pending Review",
  "sourceFileName": "scan.png",
  "sourceFileType": "image/png",
  "sourceStoragePath": "vaccination-records/AUTH_USER_UID/scan.png",
  "searchKeywords": ["juan", "dela", "cruz", "pfizer", "2023"],
  "createdBy": "AUTH_USER_UID",
  "createdByName": "Staff Name",
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

The current digitization page uploads the selected scan to Firebase Storage under `vaccination-records/{uid}/...`, then saves the reviewed OCR text and `sourceStoragePath` to Firestore.

The Search page reads these Firestore records, opens a full record detail view, lets staff edit the corrected OCR text, refreshes parsed patient/vaccine/date fields from the corrected text, marks records as completed, exports the saved text, and opens the uploaded source file through Firebase Storage.

## OCR API Contract

The frontend expects an OCR/ML backend endpoint configured by environment variables:

```env
OCR_API_URL=https://your-cloud-run-service/ocr
OCR_API_KEY=
OCR_USE_MOCK=false
```

When `OCR_API_URL` is set, the Digitize page sends the selected file to that endpoint as `multipart/form-data`:

```http
POST /ocr
Authorization: Bearer <OCR_API_KEY, if configured>
Content-Type: multipart/form-data

file=<uploaded JPG, PNG, or PDF>
```

The OCR backend should return JSON in this shape:

```json
{
  "text": "Full extracted OCR text",
  "confidence": 0.94,
  "fields": {
    "patientName": "Juan Dela Cruz",
    "vaccineType": "Pfizer",
    "vaccinationDate": "2023-08-15"
  }
}
```

`text` is required. `confidence` and `fields` are optional for now. The frontend also accepts `extractedText` as an alias for `text`.

If the backend fails, return a non-2xx response with:

```json
{
  "error": "Human-readable error message"
}
```

For local demos without an OCR backend, set `OCR_USE_MOCK=true` and leave `OCR_API_URL` empty.
