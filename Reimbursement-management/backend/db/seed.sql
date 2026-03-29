USE reimbursement_db;

INSERT INTO companies (company_code, name, base_currency, country_code)
VALUES ('DEMO01', 'Demo Corp', 'USD', 'US');

-- Password hash placeholders must be generated via bcrypt in app flow.
-- Prefer using /api/auth/register for creating users in development.
