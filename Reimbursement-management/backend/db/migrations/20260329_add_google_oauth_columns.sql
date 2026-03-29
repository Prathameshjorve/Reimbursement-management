USE reimbursement_db;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_id VARCHAR(191) NULL AFTER password_hash,
  ADD COLUMN IF NOT EXISTS auth_provider ENUM('local', 'google') NOT NULL DEFAULT 'local' AFTER google_id;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND index_name = 'uq_users_company_google'
);

SET @create_idx_sql := IF(
  @idx_exists = 0,
  'ALTER TABLE users ADD CONSTRAINT uq_users_company_google UNIQUE (company_id, google_id)',
  'SELECT 1'
);

PREPARE stmt FROM @create_idx_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
