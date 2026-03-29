# Reimbursement Management

This repository contains:

- `frontend`: static Vite web UI integrated with backend APIs
- `backend`: production-grade Express + MySQL API with RBAC and approval rule engine

## Backend Highlights

- Multi-tenant MySQL schema (`backend/db/schema.sql`)
- JWT authentication + bcrypt password hashing
- RBAC for `admin`, `manager`, and `employee`
- Dynamic approval rule engine (`SEQUENTIAL`, `PERCENTAGE`, `SPECIFIC_OVERRIDE`, `HYBRID`)
- Audit logging for authentication, workflow, expense, and approval events
- Currency conversion cache table to avoid repeated exchange-rate fetches

## Quick Start

### 1) Backend

```bash
cd backend
cp .env.example .env
# update DB credentials in .env
npm install
npm run dev
```

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend expects backend API at `http://localhost:5000/api` by default.