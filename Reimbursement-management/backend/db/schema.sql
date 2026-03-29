CREATE DATABASE IF NOT EXISTS reimbursement_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE reimbursement_db;

CREATE TABLE companies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  base_currency CHAR(3) NOT NULL,
  country_code CHAR(2) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_companies_code UNIQUE (company_code),
  CONSTRAINT chk_companies_base_currency CHECK (base_currency REGEXP '^[A-Z]{3}$')
) ENGINE=InnoDB;

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  email VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  google_id VARCHAR(191) NULL,
  auth_provider ENUM('local', 'google') NOT NULL DEFAULT 'local',
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  role ENUM('admin', 'manager', 'employee', 'finance', 'director') NOT NULL,
  manager_user_id BIGINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_users_company_email UNIQUE (company_id, email),
  CONSTRAINT uq_users_company_google UNIQUE (company_id, google_id),
  CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_users_manager FOREIGN KEY (manager_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_users_company_role ON users(company_id, role);
CREATE INDEX idx_users_company_manager ON users(company_id, manager_user_id);

CREATE TABLE workflows (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  applies_to_category ENUM('all', 'travel', 'food', 'accommodation', 'transport', 'supplies', 'other') NOT NULL DEFAULT 'all',
  approval_mode ENUM('SEQUENTIAL', 'PERCENTAGE', 'SPECIFIC_OVERRIDE', 'HYBRID') NOT NULL,
  required_approval_percent DECIMAL(5,2) NULL,
  override_approver_user_id BIGINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_workflows_name_version UNIQUE (company_id, name, version),
  CONSTRAINT chk_workflows_percent CHECK (required_approval_percent IS NULL OR (required_approval_percent > 0 AND required_approval_percent <= 100)),
  CONSTRAINT fk_workflows_company FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_workflows_override_user FOREIGN KEY (override_approver_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_workflows_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE INDEX idx_workflows_company_active_category ON workflows(company_id, is_active, applies_to_category);

CREATE TABLE workflow_steps (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  workflow_id BIGINT UNSIGNED NOT NULL,
  step_order INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  step_type ENUM('ANY_OF', 'ALL_OF', 'PERCENTAGE') NOT NULL DEFAULT 'ANY_OF',
  required_approval_percent DECIMAL(5,2) NULL,
  is_mandatory TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_workflow_steps_order UNIQUE (workflow_id, step_order),
  CONSTRAINT chk_workflow_steps_order CHECK (step_order >= 1),
  CONSTRAINT chk_workflow_steps_percent CHECK (required_approval_percent IS NULL OR (required_approval_percent > 0 AND required_approval_percent <= 100)),
  CONSTRAINT fk_workflow_steps_company FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_workflow_steps_workflow FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_workflow_steps_company_workflow_order ON workflow_steps(company_id, workflow_id, step_order);

CREATE TABLE workflow_step_approvers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  workflow_step_id BIGINT UNSIGNED NOT NULL,
  approver_user_id BIGINT UNSIGNED NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_step_approver UNIQUE (workflow_step_id, approver_user_id),
  CONSTRAINT fk_step_approvers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_step_approvers_step FOREIGN KEY (workflow_step_id) REFERENCES workflow_steps(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_step_approvers_user FOREIGN KEY (approver_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE INDEX idx_step_approvers_company_approver ON workflow_step_approvers(company_id, approver_user_id);

CREATE TABLE expenses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  submitted_by_user_id BIGINT UNSIGNED NOT NULL,
  workflow_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  receipt_data_url LONGTEXT NULL,
  receipt_file_name VARCHAR(255) NULL,
  category ENUM('travel', 'food', 'accommodation', 'transport', 'supplies', 'other') NOT NULL,
  expense_date DATE NOT NULL,
  original_amount DECIMAL(14,2) NOT NULL,
  original_currency CHAR(3) NOT NULL,
  exchange_rate DECIMAL(18,8) NOT NULL,
  converted_amount DECIMAL(14,2) NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  current_step_order INT UNSIGNED NULL,
  rejection_reason VARCHAR(500) NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_expenses_original_amount CHECK (original_amount > 0),
  CONSTRAINT chk_expenses_exchange_rate CHECK (exchange_rate > 0),
  CONSTRAINT chk_expenses_converted_amount CHECK (converted_amount > 0),
  CONSTRAINT chk_expenses_original_currency CHECK (original_currency REGEXP '^[A-Z]{3}$'),
  CONSTRAINT fk_expenses_company FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_submitter FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_workflow FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE INDEX idx_expenses_user_status ON expenses(submitted_by_user_id, status);
CREATE INDEX idx_expenses_company_status ON expenses(company_id, status);
CREATE INDEX idx_expenses_company_submitted_at ON expenses(company_id, submitted_at);

CREATE TABLE expense_approvals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  expense_id BIGINT UNSIGNED NOT NULL,
  workflow_step_id BIGINT UNSIGNED NOT NULL,
  approver_user_id BIGINT UNSIGNED NOT NULL,
  action ENUM('approved', 'rejected') NOT NULL,
  comment VARCHAR(500) NULL,
  acted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_expense_step_approver UNIQUE (expense_id, workflow_step_id, approver_user_id),
  CONSTRAINT fk_expense_approvals_company FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_expense_approvals_expense FOREIGN KEY (expense_id) REFERENCES expenses(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_expense_approvals_step FOREIGN KEY (workflow_step_id) REFERENCES workflow_steps(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_expense_approvals_user FOREIGN KEY (approver_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE INDEX idx_approvals_approver_status ON expense_approvals(approver_user_id, action);
CREATE INDEX idx_approvals_expense ON expense_approvals(expense_id);

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  entity_type ENUM('expense', 'approval', 'workflow', 'user', 'auth', 'system') NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  action VARCHAR(120) NOT NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  metadata JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_company FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_audit_company_entity ON audit_logs(company_id, entity_type, entity_id);
CREATE INDEX idx_audit_company_actor ON audit_logs(company_id, actor_user_id);

CREATE TABLE currency_rates_cache (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NULL,
  base_currency CHAR(3) NOT NULL,
  target_currency CHAR(3) NOT NULL,
  rate_date DATE NOT NULL,
  rate DECIMAL(18,8) NOT NULL,
  rate_source VARCHAR(50) NOT NULL DEFAULT 'manual',
  fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  CONSTRAINT uq_currency_cache UNIQUE (company_id, base_currency, target_currency, rate_date),
  CONSTRAINT chk_currency_cache_rate CHECK (rate > 0),
  CONSTRAINT chk_currency_cache_base CHECK (base_currency REGEXP '^[A-Z]{3}$'),
  CONSTRAINT chk_currency_cache_target CHECK (target_currency REGEXP '^[A-Z]{3}$'),
  CONSTRAINT fk_currency_cache_company FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_currency_lookup ON currency_rates_cache(base_currency, target_currency, rate_date, expires_at);
