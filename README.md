# MOSES AND GRACE PAYMENT PORTAL

A payment management portal for students and administrators, integrated with OPay Checkout.

## Production Requirements

- Node.js 18 or newer
- PostgreSQL database
- OPay merchant credentials
- A `JWT_SECRET` with at least 32 characters

## Environment Variables

Copy `.env.example` and set the values for your environment:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public
JWT_SECRET=replace-with-a-long-random-secret-at-least-32-characters
APP_BASE_URL=https://your-production-domain.com
OPAY_BASE_URL=https://testapi.opaycheckout.com
OPAY_COUNTRY=NG
OPAY_MERCHANT_ID=your-opay-merchant-id
OPAY_PUBLIC_KEY=your-opay-public-key
OPAY_SECRET_KEY=your-opay-secret-key
ENABLE_MANUAL_PAYMENTS=false
```

Use your live OPay base URL and live keys when you are ready for real payments.

## Local Setup

```bash
npm install
npm run db:generate
npm start
```

For a fresh PostgreSQL database, apply migrations with:

```bash
npm run db:deploy
```

## Render Deployment

This repo includes `render.yaml`.

1. Create a new Blueprint on Render from this GitHub repository.
2. Render will create the web service and PostgreSQL database.
3. Set the unsynced environment variables in the Render dashboard, especially `APP_BASE_URL` and all OPay credentials.
4. Deploy.

## Vercel Deployment

This repo includes `vercel.json` and a serverless API entrypoint in `api/index.js`.

1. Import the GitHub repository into Vercel.
2. Add all environment variables from `.env.example`.
3. Use a hosted PostgreSQL connection string for `DATABASE_URL`.
4. Deploy.

The static pages in `public/` are served by Vercel, while `/api/*` routes are handled by the Express serverless function.
