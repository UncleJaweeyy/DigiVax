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
