# Moses & Grace College of Health Science & Technology
## Student Payment Portal & Administrative Dashboard

A secure, modern, and high-performance payment management system integrated with **OPay Cashier Checkout**, designed specifically for students and administrators of Moses & Grace College of Health Science & Technology, Benin-City, Edo State, Nigeria.

---

## 🚀 Key Features

### 🌟 Premium Landing Page
- **Modern Responsive Design**: Fully optimized for mobile, tablet, and desktop screens with smooth micro-animations.
- **Integrated Auth Modal**: Glassmorphic modal handling Student Login & Registration with seamless tab toggles.
- **Dynamic Fee Schedule**: Read-only interactive dues table allowing students to search and filter fees by department.
- **FAQ Accordion**: Fully interactive accordion answering common payment and account queries.
- **Crest Logo Representation**: Clean, crisp inline vector SVG emblem representing the school seal.

### 🎓 Student Features
- **Interactive Dashboard**: View total assigned fees, total payments, and outstanding balance in real-time.
- **OPay Cashier Integration**: Direct checkout routing to securely process card, transfer, and wallet payments.
- **Digital Receipts**: Instant print-ready receipts generated immediately upon payment confirmation.
- **ICT Help Desk**: Submit ticket inquiries linked to specific transactions for manual review.

### 💼 Administrator Features
- **Admin Dashboard**: Overview of system-wide analytics, fees collected, and pending verification totals.
- **Student Database**: Manage student profiles, category assignments, and levels.
- **Dues Management**: Configure specific payment types (compulsory or optional) per department.
- **Ticket Help Center**: View and resolve student support tickets.

---

## 🛠️ Tech Stack

- **Backend**: Node.js & Express
- **Database**: PostgreSQL (Neon, Render, or Local)
- **ORM**: Prisma Client (v4.14.0)
- **Frontend**: HTML5, CSS3 (Glassmorphism, custom landing themes), and Vanilla JavaScript
- **Payment Gateway**: OPay Web Checkout REST API

---

## ⚙️ Environment Variables Setup

Before running the application, copy `.env.example` to `.env` and configure the following parameters:

```env
PORT=3000
APP_BASE_URL=http://localhost:3000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public
JWT_SECRET=your-random-jwt-secret-at-least-32-characters

# OPay Integration Config
OPAY_BASE_URL=https://testapi.opaycheckout.com
OPAY_COUNTRY=NG
OPAY_MERCHANT_ID=your-opay-merchant-id
OPAY_PUBLIC_KEY=your-opay-public-key
OPAY_SECRET_KEY=your-opay-secret-key
OPAY_SN= # Optional: only if terminal SN is provided

# Mode Configuration
ENABLE_MANUAL_PAYMENTS=false # Set to true to allow manual record editing

# Seed Default Admin Account
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-admin-password
ADMIN_NAME=Portal Admin
```

---

## 💻 Local Setup & Development

Follow these steps to run the payment portal on your local machine:

1. **Clone & Navigate**:
   ```bash
   git clone https://github.com/Omatsulijoshua/MOSES-AND-GRACE-PAYMENT-PORTAL.git
   cd MOSES-AND-GRACE-PAYMENT-PORTAL
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   - Create a `.env` file matching the structure above.
   - For a free cloud database, you can use a [Neon PostgreSQL](https://neon.tech/) instance.

4. **Generate Prisma Client**:
   ```bash
   npx prisma generate
   ```

5. **Apply Database Migrations**:
   ```bash
   npx prisma migrate deploy
   ```

6. **Seed Default Admin User**:
   ```bash
   npm run seed:admin
   ```

7. **Start Server**:
   ```bash
   npm start
   ```
   Open [`http://localhost:3000`](http://localhost:3000) in your web browser.

---

## 🌩️ Render Deployment Guide

Render uses an isolated build environment where databases are not accessible. Follow these instructions to prevent build errors:

1. **Create Blueprint**:
   Create a new Render Blueprint from this repository.
2. **Build and Start Commands**:
   The `render.yaml` file is pre-configured to run migrations and seeds **during container startup** instead of build time, which avoids network timeouts:
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm run db:deploy && npm run seed:admin && npm start`
3. **Environment Variables**:
   - In the Render dashboard, supply all environment variables (especially `DATABASE_URL` link, `JWT_SECRET`, and OPay keys).

---

## ⚡ Vercel Serverless Deployment Guide

Vercel hosts the front-end pages and routes API endpoints through Serverless functions.

1. **Import Project**:
   Import your GitHub repository into your Vercel Account.
2. **Configure Build Settings**:
   - **Build Command**: `npm run build && npm run db:deploy`
   - **Output Directory**: Vercel automatically reads `vercel.json` rewrites.
3. **Add Environment Variables**:
   Add `DATABASE_URL`, `JWT_SECRET`, `APP_BASE_URL` (`https://MOSES-AND-GRACE-PAYMENT-PORTAL.vercel.app`), and other keys in the project settings.
4. **Deploy**:
   Click **Deploy** to publish the app.

---

## 👥 Git Collaborator Push & Access Instructions

If you are a **Collaborator** on this repository but do not own it, follow these steps to authenticate your Git operations:

### 🔑 Authentication with GitHub PAT (Personal Access Token)
If your terminal prompts for password authentication when pushing, password login is deprecated by GitHub. You must use a Personal Access Token (PAT):

1. **Generate PAT on GitHub**:
   - Go to **GitHub Settings** ➔ **Developer Settings** ➔ **Personal Access Tokens** ➔ **Tokens (classic)**.
   - Click **Generate new token**. Select `repo` permissions scope.
   - Copy the token immediately.

2. **Configure Remote URL**:
   Update your git remote helper to include your token so you aren't prompted for passwords:
   ```bash
   git remote set-url origin https://<YOUR_GITHUB_USERNAME>:<YOUR_PERSONAL_ACCESS_TOKEN>@github.com/Omatsulijoshua/MOSES-AND-GRACE-PAYMENT-PORTAL.git
   ```

3. **Stage, Commit, and Push**:
   ```bash
   git add .
   git commit -m "docs: add detailed README explaining deployment & local setup"
   git push origin main
   ```
