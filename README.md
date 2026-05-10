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
