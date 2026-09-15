# Northstar Capital

A local full-stack foundation for a crypto investment platform. It includes a React/Vite client and an Express API with local JSON persistence so the complete workflow can be developed without paid services.

## Included now

- User signup and login with bcrypt password hashing and JWT sessions
- Separate admin role and admin-only review center
- User monitoring view foundation
- Deposit requests that remain `pending` until an admin confirms them
- Withdrawal request persistence and admin notification queueing
- Email outbox records for welcome, deposit, confirmation, and withdrawal events
- Responsive investment dashboard, wallet, strategy packages, and withdrawal form

## Run locally

Requires Node.js 20 or newer.

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

For a single production-style server, run `npm start` and open `http://localhost:4000`. It builds the React client and serves both the UI and API from Express.

The API runs at `http://localhost:4000`. Data is stored in `data/store.json`, which is intentionally local and easy to inspect. The default local admin is:

```text
Email: admin@northstar.local
Password: admin12345
```

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `JWT_SECRET` before sharing the app or deploying it. Copy `.env.example` to `.env`; the server currently reads environment variables supplied by the shell or your process manager.

## Email notifications without paying

During local development, notifications are written to `data/store.json` in the `emails` array. That gives you a free, deterministic outbox while building. For real delivery, add an SMTP provider by installing/configuring a mail transport and setting the SMTP variables in `.env`. Many providers have free development tiers, but production delivery, domain reputation, and volume can incur cost.

## What is still required before real money

This is a working application foundation, not a production financial service. Before handling real assets, replace JSON storage with PostgreSQL, add migrations and an immutable ledger, use a managed identity provider or hardened session cookies, add CSRF/rate limiting/audit logging, implement KYC/AML and jurisdictional compliance, and connect a custody or blockchain provider. Deposits must be credited only after server-side verification of the chain transaction, token contract, network, destination, amount, and required confirmations. Never credit funds from a browser confirmation click.

Package returns in the interface are illustrative and not guaranteed. Real investment products need legal, compliance, and security review.
