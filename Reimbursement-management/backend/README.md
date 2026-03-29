# Reimbursement Backend (MySQL + Express)

Production-grade backend for a multi-tenant reimbursement management system.

## Stack
- Node.js + Express
- MySQL 8+
- JWT auth + bcrypt
- Passport.js + Google OAuth 2.0
- Role-based access control (admin/manager/employee/finance/director)

## Project Structure

```text
backend/
  db/
    schema.sql
  src/
    config/
      db.js
      env.js
    controllers/
      approvalController.js
      authController.js
      expenseController.js
      workflowController.js
    middleware/
      auth.js
      errorHandler.js
      rbac.js
    models/
      approvalModel.js
      auditLogModel.js
      companyModel.js
      currencyModel.js
      dbExecutor.js
      expenseModel.js
      userModel.js
      workflowModel.js
    routes/
      approvalRoutes.js
      authRoutes.js
      expenseRoutes.js
      index.js
      workflowRoutes.js
    services/
      approvalService.js
      auditService.js
      authService.js
      currencyService.js
      expenseService.js
      ruleEngineService.js
      workflowService.js
    utils/
      asyncHandler.js
      httpError.js
      jwt.js
    app.js
    server.js
```

## Setup

1. Create MySQL schema:
   - Run `db/schema.sql`
  - If DB already exists, run `db/migrations/20260329_add_google_oauth_columns.sql`
2. Configure env:
   - Copy `.env.example` to `.env`
3. Install dependencies:
   - `npm install`
4. Start API:
   - `npm run dev`

API base URL: `http://localhost:5000/api`

## Google OAuth Setup

1. Open Google Cloud Console and create/select a project.
2. Enable `Google People API` (or basic profile/email scope support).
3. Go to `APIs & Services > Credentials` and create an `OAuth client ID`.
4. Choose application type `Web application`.
5. Add redirect URI:
  - `http://localhost:5000/api/auth/google/callback`
6. Copy client ID and client secret into backend `.env`:
  - `GOOGLE_CLIENT_ID=...`
  - `GOOGLE_CLIENT_SECRET=...`
  - `GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback`
  - `FRONTEND_BASE_URL=http://localhost:5173`
7. Keep `JWT_SECRET` long and random for production.

OAuth endpoints:
- `GET /api/auth/google`
- `GET /api/auth/google/callback`

## Approval Rule Engine

Main implementation: `src/services/ruleEngineService.js`

`recalculateApproval(expenseId, companyId)`:
- loads expense/workflow/steps/approvers/approval votes
- computes status dynamically for:
  - `SEQUENTIAL`
  - `PERCENTAGE`
  - `SPECIFIC_OVERRIDE`
  - `HYBRID`
- returns computed `approved/rejected/pending` plus `currentStepOrder`
- called after every approval action

## API Endpoints

### Auth
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/google`
- `GET /auth/google/callback`

### Expenses
- `POST /expenses`
- `GET /expenses`
- `GET /expenses/:id`

### Approvals
- `POST /approvals/action`
- `GET /approvals/pending`

### Workflows (Admin)
- `POST /workflows`
- `GET /workflows`

## Example Requests

### Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "companyCode": "ACME01",
  "companyName": "Acme Corp",
  "baseCurrency": "USD",
  "countryCode": "US",
  "firstName": "Alice",
  "lastName": "Admin",
  "email": "alice@acme.com",
  "password": "StrongPass123!",
  "role": "admin"
}
```

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "companyCode": "ACME01",
  "email": "alice@acme.com",
  "password": "StrongPass123!"
}
```

### Create Workflow (admin)

```http
POST /api/workflows
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "name": "Travel Approval",
  "appliesToCategory": "travel",
  "approvalMode": "HYBRID",
  "requiredApprovalPercent": 60,
  "overrideApproverUserId": 2,
  "steps": [
    {
      "stepOrder": 1,
      "name": "Manager Review",
      "stepType": "ANY_OF",
      "approverUserIds": [2, 3]
    },
    {
      "stepOrder": 2,
      "name": "Finance Review",
      "stepType": "ALL_OF",
      "approverUserIds": [4]
    }
  ]
}
```

### Submit Expense

```http
POST /api/expenses
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "title": "Client Dinner",
  "description": "Dinner meeting with client",
  "category": "food",
  "expenseDate": "2026-03-29",
  "originalAmount": 120,
  "originalCurrency": "USD"
}
```

### Approve/Reject Expense

```http
POST /api/approvals/action
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "expenseId": 10,
  "action": "approved",
  "comment": "Looks valid"
}
```
