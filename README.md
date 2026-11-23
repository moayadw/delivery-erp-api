# Delivery ERP API

Backend for a project-delivery system: projects → deliveries → receipts (20+ per delivery), synced to an ERP (Odoo).

**Stack:** NestJS, TypeORM, PostgreSQL, Redis (for the sync queue, added in a later step), JWT auth, Swagger.

## Run it

```bash
docker compose up -d          # Postgres + Redis
cp .env.example .env          # then change the two JWT secrets
npm install
npm run start:dev
```

Swagger UI: http://localhost:3000/docs  (API prefix: `/api`)

## Test the auth flow in Swagger
1. `POST /api/auth/register` → copy `accessToken`
2. Click **Authorize** (top right), paste the token
3. `GET /api/auth/me`, then create a project, then a delivery under it
4. `POST /api/auth/refresh` with the `refreshToken` to get a new pair (tokens rotate on every use)

## Endpoints (step 1)
| Method | Path | Notes |
|---|---|---|
| POST | /api/auth/register, /login, /refresh, /logout | |
| GET | /api/auth/me | |
| CRUD | /api/projects | scoped to the logged-in owner |
| POST/GET | /api/projects/:projectId/deliveries | |
| GET/PATCH/DELETE | /api/deliveries/:id | |

## Data model
- **User** 1─* **Project** 1─* **Delivery** 1─* **Receipt**
- **Receipt** has a unique `(deliveryId, clientId)` so retried uploads never duplicate.
- **Delivery.erpReference / Receipt.erpDocumentNumber** store ERP IDs so syncs are idempotent.
- **SyncLog** is the audit trail for every ERP action.

## Notes
- `synchronize: true` is for development only. Switch to migrations before deploying.
- Auth model: one active session per user; refresh tokens are hashed and rotated.

## Roadmap
- [x] Step 1: auth, projects, deliveries, schema
- [ ] Step 2: receipts + bulk upload
- [ ] Step 3: Odoo sync (BullMQ, retries) + webhooks
