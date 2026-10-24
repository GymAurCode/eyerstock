/**
 * Schema migrations, in order.
 *
 * Append only. Never edit a shipped migration: add a new one with the next
 * version number. Every migration must be additive so existing shop data is
 * preserved.
 */

import type { Migration } from "../migrator";

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: "001_core_parties_products",
    up: (db) => {
      db.exec(`
        CREATE TABLE parties (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          code              TEXT    NOT NULL UNIQUE,
          name              TEXT    NOT NULL,
          kind              TEXT    NOT NULL CHECK (kind IN ('customer','supplier','both')),
          phone             TEXT,
          email             TEXT,
          trn               TEXT,
          address_line      TEXT,
          emirate           TEXT,
          opening_balance   INTEGER NOT NULL DEFAULT 0,
          credit_limit      INTEGER,
          is_active         INTEGER NOT NULL DEFAULT 1,
          created_at        TEXT    NOT NULL,
          updated_at        TEXT    NOT NULL
        );

        CREATE TABLE products (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          sku               TEXT    NOT NULL UNIQUE,
          barcode           TEXT,
          name              TEXT    NOT NULL,
          name_ar           TEXT,
          description       TEXT,
          category          TEXT,
          unit              TEXT    NOT NULL DEFAULT 'pcs',
          quantity_milli    INTEGER NOT NULL DEFAULT 0,
          reorder_level_milli INTEGER NOT NULL DEFAULT 0,
          average_cost_fils INTEGER NOT NULL DEFAULT 0,
          sale_price_fils   INTEGER NOT NULL DEFAULT 0,
          vat_treatment     TEXT    NOT NULL DEFAULT 'standard'
                              CHECK (vat_treatment IN ('standard','zero','exempt')),
          is_serialised     INTEGER NOT NULL DEFAULT 0,
          is_service        INTEGER NOT NULL DEFAULT 0,
          warranty_months   INTEGER NOT NULL DEFAULT 12,
          is_active         INTEGER NOT NULL DEFAULT 1,
          created_at        TEXT    NOT NULL,
          updated_at        TEXT    NOT NULL
        );

        CREATE INDEX idx_products_barcode ON products (barcode);
        CREATE INDEX idx_products_name    ON products (name);
        CREATE INDEX idx_parties_name     ON parties (name);
        CREATE INDEX idx_parties_kind     ON parties (kind);
      `);
    },
  },
  {
    version: 2,
    name: "002_sales_documents",
    up: (db) => {
      db.exec(`
        CREATE TABLE documents (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          kind            TEXT    NOT NULL
                            CHECK (kind IN ('invoice','quotation','deliveryNote','creditNote',
                                            'purchaseInvoice','purchaseReturn','stockAdjustment')),
          number          TEXT    NOT NULL,
          party_id        INTEGER REFERENCES parties (id) ON DELETE RESTRICT,
          issue_date      TEXT    NOT NULL,
          due_date        TEXT,
          status          TEXT    NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','issued','partPaid','paid','cancelled')),
          net_fils        INTEGER NOT NULL DEFAULT 0,
          vat_fils        INTEGER NOT NULL DEFAULT 0,
          gross_fils      INTEGER NOT NULL DEFAULT 0,
          paid_fils       INTEGER NOT NULL DEFAULT 0,
          cost_fils       INTEGER NOT NULL DEFAULT 0,
          cost_fiscal_year INTEGER,
          notes           TEXT,
          converted_to_id INTEGER REFERENCES documents (id) ON DELETE SET NULL,
          created_by      TEXT,
          created_at      TEXT    NOT NULL,
          updated_at      TEXT    NOT NULL,
          UNIQUE (kind, number)
        );

        CREATE TABLE document_lines (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          document_id         INTEGER NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
          product_id          INTEGER REFERENCES products (id) ON DELETE RESTRICT,
          line_no             INTEGER NOT NULL,
          description         TEXT    NOT NULL,
          quantity_milli      INTEGER NOT NULL,
          unit_price_fils     INTEGER NOT NULL,
          net_fils            INTEGER NOT NULL,
          vat_fils            INTEGER NOT NULL,
          vat_treatment       TEXT    NOT NULL DEFAULT 'standard',
          unit_cost_fils      INTEGER NOT NULL DEFAULT 0,
          cost_fils           INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX idx_documents_party  ON documents (party_id);
        CREATE INDEX idx_documents_date   ON documents (issue_date);
        CREATE INDEX idx_documents_kind   ON documents (kind, issue_date);
        CREATE INDEX idx_documents_status ON documents (status);
        CREATE INDEX idx_lines_document  ON document_lines (document_id);
        CREATE INDEX idx_lines_product   ON document_lines (product_id);
      `);
    },
  },
  {
    version: 3,
    name: "003_stock_movements",
    up: (db) => {
      db.exec(`
        CREATE TABLE stock_movements (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id       INTEGER NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
          document_id      INTEGER REFERENCES documents (id) ON DELETE SET NULL,
          document_line_id INTEGER REFERENCES document_lines (id) ON DELETE SET NULL,
          movement_date    TEXT    NOT NULL,
          kind             TEXT    NOT NULL
                             CHECK (kind IN ('receipt','issue','reversal','adjustmentIn','adjustmentOut')),
          quantity_milli   INTEGER NOT NULL,
          unit_cost_fils   INTEGER NOT NULL DEFAULT 0,
          cost_fils        INTEGER NOT NULL DEFAULT 0,
          reverses_id      INTEGER REFERENCES stock_movements (id) ON DELETE RESTRICT,
          notes            TEXT
        );

        CREATE INDEX idx_movements_product ON stock_movements (product_id, movement_date);
        CREATE INDEX idx_movements_date    ON stock_movements (movement_date);
        CREATE INDEX idx_movements_doc     ON stock_movements (document_id);
      `);
    },
  },
  {
    version: 4,
    name: "004_payments_and_allocations",
    up: (db) => {
      db.exec(`
        CREATE TABLE payments (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          direction     TEXT    NOT NULL CHECK (direction IN ('inbound','outbound')),
          party_id      INTEGER NOT NULL REFERENCES parties (id) ON DELETE RESTRICT,
          payment_date  TEXT    NOT NULL,
          method        TEXT    NOT NULL DEFAULT 'cash'
                          CHECK (method IN ('cash','bank','cheque','card','online')),
          amount_fils   INTEGER NOT NULL CHECK (amount_fils > 0),
          reference     TEXT,
          on_account_fils INTEGER NOT NULL DEFAULT 0,
          notes         TEXT,
          created_by    TEXT,
          created_at    TEXT    NOT NULL
        );

        CREATE TABLE payment_allocations (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          payment_id    INTEGER NOT NULL REFERENCES payments (id) ON DELETE CASCADE,
          document_id   INTEGER NOT NULL REFERENCES documents (id) ON DELETE RESTRICT,
          amount_fils   INTEGER NOT NULL CHECK (amount_fils > 0)
        );

        CREATE INDEX idx_payments_party  ON payments (party_id, payment_date);
        CREATE INDEX idx_allocations_doc ON payment_allocations (document_id);
      `);
    },
  },
  {
    version: 5,
    name: "005_post_dated_cheques",
    up: (db) => {
      db.exec(`
        CREATE TABLE cheques (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          direction        TEXT    NOT NULL CHECK (direction IN ('inbound','outbound')),
          cheque_number    TEXT    NOT NULL,
          bank             TEXT    NOT NULL,
          party_id         INTEGER REFERENCES parties (id) ON DELETE RESTRICT,
          payment_id       INTEGER REFERENCES payments (id) ON DELETE SET NULL,
          amount_fils      INTEGER NOT NULL CHECK (amount_fils > 0),
          issue_date       TEXT    NOT NULL,
          due_date         TEXT    NOT NULL,
          status           TEXT    NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','cleared','bounced','cancelled')),
          cleared_on       TEXT,
          bounced_reason   TEXT,
          reminded_at      TEXT,
          created_at       TEXT    NOT NULL,
          updated_at       TEXT    NOT NULL
        );

        CREATE INDEX idx_cheques_due    ON cheques (due_date, status);
        CREATE INDEX idx_cheques_status ON cheques (status);
        CREATE INDEX idx_cheques_party  ON cheques (party_id);
      `);
    },
  },
  {
    version: 6,
    name: "006_serials_warranties",
    up: (db) => {
      db.exec(`
        CREATE TABLE serial_units (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          serial_number  TEXT    NOT NULL UNIQUE,
          product_id     INTEGER NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
          document_line_id INTEGER REFERENCES document_lines (id) ON DELETE SET NULL,
          customer_id    INTEGER REFERENCES parties (id) ON DELETE SET NULL,
          sold_on        TEXT,
          warranty_start TEXT,
          warranty_end   TEXT,
          status         TEXT    NOT NULL DEFAULT 'sold'
                         CHECK (status IN ('inStock','sold','returned','scrapped')),
          notes          TEXT,
          created_at     TEXT    NOT NULL,
          updated_at     TEXT    NOT NULL
        );

        CREATE TABLE warranty_claims (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          serial_unit_id INTEGER NOT NULL REFERENCES serial_units (id) ON DELETE CASCADE,
          claim_date     TEXT    NOT NULL,
          issue          TEXT    NOT NULL,
          resolution     TEXT,
          parts_cost_fils INTEGER NOT NULL DEFAULT 0,
          labour_cost_fils INTEGER NOT NULL DEFAULT 0,
          is_warranty    INTEGER NOT NULL DEFAULT 1,
          created_at     TEXT    NOT NULL
        );

        CREATE INDEX idx_serials_product ON serial_units (product_id);
        CREATE INDEX idx_serials_customer ON serial_units (customer_id);
        CREATE INDEX idx_serials_warranty ON serial_units (warranty_end);
        CREATE INDEX idx_claims_serial   ON warranty_claims (serial_unit_id);
      `);
    },
  },
  {
    version: 7,
    name: "007_service_contracts",
    up: (db) => {
      db.exec(`
        CREATE TABLE service_contracts (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          contract_number   TEXT    NOT NULL UNIQUE,
          customer_id       INTEGER NOT NULL REFERENCES parties (id) ON DELETE RESTRICT,
          product_id        INTEGER REFERENCES products (id) ON DELETE SET NULL,
          serial_unit_id    INTEGER REFERENCES serial_units (id) ON DELETE SET NULL,
          start_date        TEXT    NOT NULL,
          end_date          TEXT,
          interval_days     INTEGER NOT NULL DEFAULT 180,
          visits_total      INTEGER NOT NULL DEFAULT 2,
          visits_used       INTEGER NOT NULL DEFAULT 0,
          amount_fils       INTEGER NOT NULL DEFAULT 0,
          status            TEXT    NOT NULL DEFAULT 'active'
                            CHECK (status IN ('draft','active','expired','cancelled')),
          notes             TEXT,
          created_at        TEXT    NOT NULL,
          updated_at        TEXT    NOT NULL
        );

        CREATE TABLE service_visits (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          contract_id    INTEGER NOT NULL REFERENCES service_contracts (id) ON DELETE CASCADE,
          visit_date     TEXT    NOT NULL,
          engineer       TEXT,
          work_done      TEXT,
          parts_cost_fils INTEGER NOT NULL DEFAULT 0,
          next_due_date  TEXT,
          created_at     TEXT    NOT NULL
        );

        CREATE TABLE filter_schedules (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id   INTEGER NOT NULL REFERENCES parties (id) ON DELETE CASCADE,
          contract_id   INTEGER REFERENCES service_contracts (id) ON DELETE SET NULL,
          product_id    INTEGER NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
          quantity_milli INTEGER NOT NULL DEFAULT 1000,
          due_date      TEXT    NOT NULL,
          completed_on  TEXT,
          status        TEXT    NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','done','skipped')),
          notes         TEXT,
          created_at    TEXT    NOT NULL
        );

        CREATE INDEX idx_contracts_customer ON service_contracts (customer_id, status);
        CREATE INDEX idx_contracts_due     ON service_contracts (end_date, status);
        CREATE INDEX idx_visits_contract   ON service_visits (contract_id, visit_date);
        CREATE INDEX idx_filters_due       ON filter_schedules (due_date, status);
      `);
    },
  },
  {
    version: 8,
    name: "008_auth_and_permissions",
    up: (db) => {
      db.exec(`
        -- roles before users: users.role_id references it.
        CREATE TABLE roles (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL UNIQUE,
          description TEXT,
          is_system   INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT    NOT NULL
        );

        CREATE TABLE users (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          username          TEXT    NOT NULL UNIQUE,
          display_name      TEXT    NOT NULL,
          password_hash     TEXT    NOT NULL,
          password_salt     TEXT    NOT NULL,
          role_id           INTEGER REFERENCES roles (id) ON DELETE RESTRICT,
          must_change_password INTEGER NOT NULL DEFAULT 0,
          is_active         INTEGER NOT NULL DEFAULT 1,
          failed_attempts   INTEGER NOT NULL DEFAULT 0,
          locked_until      TEXT,
          last_login_at     TEXT,
          created_at        TEXT    NOT NULL,
          updated_at        TEXT    NOT NULL
        );

        CREATE TABLE role_permissions (
          role_id    INTEGER NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
          module     TEXT    NOT NULL,
          action     TEXT    NOT NULL CHECK (action IN ('view','create','edit','delete','cancel','export')),
          PRIMARY KEY (role_id, module, action)
        );

        CREATE TABLE login_attempts (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          username    TEXT    NOT NULL,
          success     INTEGER NOT NULL,
          ip_address  TEXT,
          attempted_at TEXT   NOT NULL
        );

        CREATE INDEX idx_users_username  ON users (username);
        CREATE INDEX idx_role_perms      ON role_permissions (role_id, module);
        CREATE INDEX idx_login_attempts ON login_attempts (username, attempted_at);
      `);
    },
  },
  {
    version: 9,
    name: "009_audit_log",
    up: (db) => {
      db.exec(`
        CREATE TABLE audit_log (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          occurred_at TEXT    NOT NULL,
          actor_id    INTEGER,
          actor_name  TEXT    NOT NULL,
          module      TEXT    NOT NULL,
          action      TEXT    NOT NULL,
          entity_type TEXT    NOT NULL,
          entity_id   TEXT,
          old_values  TEXT,
          new_values  TEXT,
          prev_hash   TEXT    NOT NULL,
          entry_hash  TEXT    NOT NULL
        );

        CREATE INDEX idx_audit_time   ON audit_log (occurred_at);
        CREATE INDEX idx_audit_actor  ON audit_log (actor_id, occurred_at);
        CREATE INDEX idx_audit_module ON audit_log (module, action);
        CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id);
      `);
    },
  },
  {
    version: 10,
    name: "010_partner_accounts",
    up: (db) => {
      db.exec(`
        CREATE TABLE partners (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          name          TEXT    NOT NULL UNIQUE,
          share_percent REAL    NOT NULL CHECK (share_percent > 0),
          is_active     INTEGER NOT NULL DEFAULT 1,
          created_at    TEXT    NOT NULL
        );

        CREATE TABLE partner_transactions (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          partner_id  INTEGER NOT NULL REFERENCES partners (id) ON DELETE RESTRICT,
          txn_date    TEXT    NOT NULL,
          kind        TEXT    NOT NULL CHECK (kind IN ('capital','drawing','profit','donation')),
          amount_fils INTEGER NOT NULL,
          period_ref  TEXT,
          notes       TEXT,
          created_by  TEXT,
          created_at  TEXT    NOT NULL
        );

        CREATE TABLE period_closures (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          fiscal_year         INTEGER NOT NULL,
          period_start        TEXT    NOT NULL,
          period_end          TEXT    NOT NULL,
          revenue_fils        INTEGER NOT NULL,
          cost_foods_fils     INTEGER NOT NULL,
          operating_expenses_fils INTEGER NOT NULL DEFAULT 0,
          net_profit_fils     INTEGER NOT NULL,
          donation_fils       INTEGER NOT NULL,
          distributable_fils  INTEGER NOT NULL,
          is_locked           INTEGER NOT NULL DEFAULT 0,
          locked_at           TEXT,
          locked_by           TEXT,
          created_at          TEXT    NOT NULL,
          UNIQUE (fiscal_year, period_start)
        );

        CREATE TABLE period_locks (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          fiscal_year INTEGER NOT NULL,
          period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
          locked_at   TEXT    NOT NULL,
          locked_by   TEXT    NOT NULL,
          UNIQUE (fiscal_year, period_month)
        );

        CREATE INDEX idx_partner_txns    ON partner_transactions (partner_id, txn_date);
        CREATE INDEX idx_period_locks    ON period_locks (fiscal_year, period_month);
        CREATE INDEX idx_closures_period ON period_closures (fiscal_year, period_end);
      `);
    },
  },
  {
    version: 11,
    name: "011_settings_and_sequences",
    up: (db) => {
      db.exec(`
        CREATE TABLE settings (
          key         TEXT PRIMARY KEY,
          value       TEXT NOT NULL,
          updated_at  TEXT NOT NULL
        );

        CREATE TABLE document_sequences (
          kind        TEXT    NOT NULL,
          fiscal_year INTEGER NOT NULL,
          last_used   INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (kind, fiscal_year)
        );

        CREATE TABLE onboarding_steps (
          key          TEXT PRIMARY KEY,
          completed_at TEXT,
          completed_by TEXT
        );
      `);
    },
  },
  {
    version: 12,
    name: "012_product_bundles",
    up: (db) => {
      db.exec(`
        CREATE TABLE product_bundles (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          sku         TEXT    NOT NULL UNIQUE,
          name        TEXT    NOT NULL,
          name_ar     TEXT,
          bundle_price_fils INTEGER NOT NULL DEFAULT 0,
          vat_treatment TEXT  NOT NULL DEFAULT 'standard'
                          CHECK (vat_treatment IN ('standard','zero','exempt')),
          is_active   INTEGER NOT NULL DEFAULT 1,
          created_at  TEXT    NOT NULL,
          updated_at  TEXT    NOT NULL
        );

        CREATE TABLE bundle_components (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          bundle_id     INTEGER NOT NULL REFERENCES product_bundles (id) ON DELETE CASCADE,
          product_id    INTEGER NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
          quantity_milli INTEGER NOT NULL DEFAULT 1000
        );

        CREATE INDEX idx_bundle_components ON bundle_components (bundle_id);
      `);
    },
  },
  {
    version: 13,
    name: "013_expenses_and_cash",
    up: (db) => {
      db.exec(`
        -- Expenses are needed for net profit on the dashboard and for the
        -- operating-expense line of the partner closing statement.
        CREATE TABLE expenses (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          expense_date    TEXT    NOT NULL,
          category        TEXT    NOT NULL DEFAULT 'general',
          description     TEXT    NOT NULL,
          amount_fils     INTEGER NOT NULL CHECK (amount_fils > 0),
          vat_fils        INTEGER NOT NULL DEFAULT 0,
          payment_method  TEXT    NOT NULL DEFAULT 'cash'
                            CHECK (payment_method IN ('cash','bank','card','cheque')),
          party_id        INTEGER REFERENCES parties (id) ON DELETE SET NULL,
          reference       TEXT,
          notes           TEXT,
          created_by      TEXT,
          created_at      TEXT    NOT NULL,
          updated_at      TEXT    NOT NULL
        );

        CREATE INDEX idx_expenses_date     ON expenses (expense_date);
        CREATE INDEX idx_expenses_category ON expenses (category);

        -- Document subtypes: a purchase invoice is a bill, and a bill needs its
        -- own supplier reference and due date.
        CREATE TABLE supplier_bills (
          document_id    INTEGER PRIMARY KEY REFERENCES documents (id) ON DELETE CASCADE,
          supplier_invoice_no TEXT,
          bill_date      TEXT,
          due_date       TEXT
        );
      `);
    },
  },
  {
    version: 14,
    name: "014_document_links_and_receipts",
    up: (db) => {
      db.exec(`
        -- A credit note must point at the invoice it reverses, so stock can be
        -- returned at the original cost and the audit trail is unbroken.
        ALTER TABLE documents ADD COLUMN reverses_id INTEGER REFERENCES documents (id) ON DELETE SET NULL;

        -- Reason recorded on credit notes / purchase returns.
        ALTER TABLE documents ADD COLUMN reason TEXT;

        -- Sequential receipt number for the payment screens.
        ALTER TABLE payments ADD COLUMN receipt_number TEXT;
        CREATE UNIQUE INDEX idx_payments_receipt ON payments (receipt_number)
          WHERE receipt_number IS NOT NULL;

        -- Payment terms in days per party, used for due dates and aging.
        ALTER TABLE parties ADD COLUMN terms_days INTEGER NOT NULL DEFAULT 0;

        -- Fiscal year stamp on every document so period reports stay cheap even
        -- if the fiscal-year start month is changed later.
        ALTER TABLE documents ADD COLUMN fiscal_year INTEGER;
        CREATE INDEX idx_documents_fy ON documents (fiscal_year, kind, status);

        ALTER TABLE stock_movements ADD COLUMN fiscal_year INTEGER;
        CREATE INDEX idx_movements_fy ON stock_movements (fiscal_year, kind);

        ALTER TABLE expenses ADD COLUMN fiscal_year INTEGER;
        CREATE INDEX idx_expenses_fy ON expenses (fiscal_year);

        ALTER TABLE payments ADD COLUMN fiscal_year INTEGER;
      `);
    },
  },
  {
    version: 15,
    name: "015_service_scheduling_and_labels",
    up: (db) => {
      db.exec(`
        -- Installation record: what was fitted for a customer on a date. Kept
        -- separate from service_contracts because an installation happens even
        -- when the customer never buys an AMC.
        CREATE TABLE installations (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id    INTEGER NOT NULL REFERENCES parties (id) ON DELETE RESTRICT,
          product_id     INTEGER REFERENCES products (id) ON DELETE SET NULL,
          serial_unit_id INTEGER REFERENCES serial_units (id) ON DELETE SET NULL,
          installed_on   TEXT    NOT NULL,
          location_text  TEXT,
          engineer       TEXT,
          invoice_id     INTEGER REFERENCES documents (id) ON DELETE SET NULL,
          notes          TEXT,
          created_at     TEXT    NOT NULL
        );

        CREATE INDEX idx_installations_customer ON installations (customer_id, installed_on);

        -- Reminder log so a customer is not chased twice for the same visit.
        ALTER TABLE filter_schedules ADD COLUMN reminded_at TEXT;

        -- Product category text index for the catalogue's grouped filter.
        CREATE INDEX idx_products_category ON products (category);

        -- Barcode uniqueness for products that carry one. Partial index keeps
        -- the many NULL barcodes legal while still catching real duplicates.
        CREATE UNIQUE INDEX idx_products_barcode_unique ON products (barcode)
          WHERE barcode IS NOT NULL AND barcode <> '';
      `);
    },
  },
  {
    version: 16,
    name: "016_offline_licence",
    up: (db) => {
      db.exec(`
        -- Offline licence, behind a config flag that is off by default. The
        -- machine id is hashed with the key so the licence is bound to one PC.
        CREATE TABLE licences (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          licence_key     TEXT    NOT NULL,
          customer_name   TEXT,
          machine_id      TEXT    NOT NULL,
          issued_at       TEXT    NOT NULL,
          expires_on      TEXT,
          activated_at    TEXT,
          notes           TEXT
        );
      `);
    },
  },
  {
    version: 17,
    name: "017_vat_outside_scope",
    /**
     * Widens the VAT treatment CHECK on `products` and `product_bundles` to
     * include `outsideScope`.
     *
     * SQLite cannot ALTER a CHECK constraint, so this uses the procedure from
     * the SQLite manual ("Making Other Kinds Of Table Schema Changes"): build a
     * replacement table with the new constraint, copy every row across, drop the
     * original, rename the replacement into place and recreate the indexes.
     *
     * The copy is a straight `INSERT ... SELECT` of every column, so existing
     * rows, ids and AUTOINCREMENT sequence values are all preserved. Foreign
     * keys are switched off by the migration runner around this migration
     * (`requiresForeignKeysOff`) because dropping a parent table that other
     * tables reference would otherwise fail; the runner re-enables them and the
     * migration itself asserts referential integrity before finishing.
     */
    requiresForeignKeysOff: true,
    up: (db) => {
      db.exec(`
        CREATE TABLE products_new (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          sku               TEXT    NOT NULL UNIQUE,
          barcode           TEXT,
          name              TEXT    NOT NULL,
          name_ar           TEXT,
          description       TEXT,
          category          TEXT,
          unit              TEXT    NOT NULL DEFAULT 'pcs',
          quantity_milli    INTEGER NOT NULL DEFAULT 0,
          reorder_level_milli INTEGER NOT NULL DEFAULT 0,
          average_cost_fils INTEGER NOT NULL DEFAULT 0,
          sale_price_fils   INTEGER NOT NULL DEFAULT 0,
          vat_treatment     TEXT    NOT NULL DEFAULT 'standard'
                              CHECK (vat_treatment IN ('standard','zero','exempt','outsideScope')),
          is_serialised     INTEGER NOT NULL DEFAULT 0,
          is_service        INTEGER NOT NULL DEFAULT 0,
          warranty_months   INTEGER NOT NULL DEFAULT 12,
          is_active         INTEGER NOT NULL DEFAULT 1,
          created_at        TEXT    NOT NULL,
          updated_at        TEXT    NOT NULL
        );

        INSERT INTO products_new (
          id, sku, barcode, name, name_ar, description, category, unit,
          quantity_milli, reorder_level_milli, average_cost_fils, sale_price_fils,
          vat_treatment, is_serialised, is_service, warranty_months, is_active,
          created_at, updated_at
        )
        SELECT
          id, sku, barcode, name, name_ar, description, category, unit,
          quantity_milli, reorder_level_milli, average_cost_fils, sale_price_fils,
          vat_treatment, is_serialised, is_service, warranty_months, is_active,
          created_at, updated_at
        FROM products;

        DROP TABLE products;
        ALTER TABLE products_new RENAME TO products;

        CREATE INDEX idx_products_barcode ON products (barcode);
        CREATE INDEX idx_products_name    ON products (name);
        CREATE INDEX idx_products_category ON products (category);
        CREATE UNIQUE INDEX idx_products_barcode_unique ON products (barcode)
          WHERE barcode IS NOT NULL AND barcode <> '';

        CREATE TABLE product_bundles_new (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          sku         TEXT    NOT NULL UNIQUE,
          name        TEXT    NOT NULL,
          name_ar     TEXT,
          bundle_price_fils INTEGER NOT NULL DEFAULT 0,
          vat_treatment TEXT  NOT NULL DEFAULT 'standard'
                          CHECK (vat_treatment IN ('standard','zero','exempt','outsideScope')),
          is_active   INTEGER NOT NULL DEFAULT 1,
          created_at  TEXT    NOT NULL,
          updated_at  TEXT    NOT NULL
        );

        INSERT INTO product_bundles_new (
          id, sku, name, name_ar, bundle_price_fils, vat_treatment, is_active,
          created_at, updated_at
        )
        SELECT
          id, sku, name, name_ar, bundle_price_fils, vat_treatment, is_active,
          created_at, updated_at
        FROM product_bundles;

        DROP TABLE product_bundles;
        ALTER TABLE product_bundles_new RENAME TO product_bundles;
      `);

      // Belt and braces: the rebuild must not have orphaned anything. Foreign
      // keys were off for the DROP/RENAME, so assert them here while the rows
      // are already back in place.
      const violations = db.pragma("foreign_key_check") as unknown[];
      if (violations.length > 0) {
        throw new Error(
          `vat_outside_scope rebuild left ${violations.length} referential integrity violation(s)`,
        );
      }
    },
  },
  {
    version: 18,
    name: "018_simplify_to_core_inventory",
    /**
     * Drops the tables of the features removed in the 0.3.0 simplification
     * (quotations, returns, cheques, kits, barcode labels, service, warranty,
     * period lock, audit log viewer, onboarding, licences) and collapses the
     * role matrix to the two fixed roles.
     *
     * The data that stays - products, parties, invoices, purchases, expenses,
     * payments, partners, users - is never rewritten: documents of a removed
     * kind are left exactly as they are rather than deleted, because the rule
     * for a shop's books is that nothing silently disappears. The logic that
     * could create them is gone, so they simply never appear again.
     *
     * Users are remapped rather than dropped: an Administrator stays an
     * Administrator, and every other role collapses onto the fixed Staff role.
     * Deleting the old roles before remapping would trip the RESTRICT on
     * `users.role_id`.
     */
    requiresForeignKeysOff: true,
    up: (db) => {
      db.exec(`
        -- Two fixed roles, created by name so an existing Administrator keeps
        -- its identity and its users.
        INSERT OR IGNORE INTO roles (name, description, is_system, created_at)
          VALUES ('Administrator', 'Full access, including settings and users.', 1, datetime('now'));
        INSERT OR IGNORE INTO roles (name, description, is_system, created_at)
          VALUES ('Staff', 'Day-to-day selling and stock. No reports, no settings.', 1, datetime('now'));

        -- Everyone who is not an Administrator becomes Staff.
        UPDATE users
           SET role_id = (SELECT id FROM roles WHERE name = 'Staff')
         WHERE role_id IS NULL
            OR role_id <> (SELECT id FROM roles WHERE name = 'Administrator');

        -- One fixed permission set per role, replacing the editable matrix.
        DELETE FROM role_permissions;

        INSERT INTO role_permissions (role_id, module, action)
          SELECT r.id, m.module, a.action
            FROM roles r
            CROSS JOIN (
              SELECT 'dashboard' AS module UNION ALL
              SELECT 'parties' UNION ALL
              SELECT 'products' UNION ALL
              SELECT 'sales' UNION ALL
              SELECT 'purchases' UNION ALL
              SELECT 'inventory' UNION ALL
              SELECT 'payments' UNION ALL
              SELECT 'finance' UNION ALL
              SELECT 'reports' UNION ALL
              SELECT 'users' UNION ALL
              SELECT 'settings' UNION ALL
              SELECT 'backup' UNION ALL
              SELECT 'partners'
            ) m
            CROSS JOIN (
              SELECT 'view' AS action UNION ALL
              SELECT 'create' UNION ALL
              SELECT 'edit' UNION ALL
              SELECT 'delete' UNION ALL
              SELECT 'cancel' UNION ALL
              SELECT 'export'
            ) a
           WHERE r.name = 'Administrator';

        -- Staff: everything except the reports that show profit, the partner
        -- split, and settings.
        INSERT INTO role_permissions (role_id, module, action)
          SELECT r.id, m.module, a.action
            FROM roles r
            CROSS JOIN (
              SELECT 'dashboard' AS module UNION ALL
              SELECT 'parties' UNION ALL
              SELECT 'products' UNION ALL
              SELECT 'sales' UNION ALL
              SELECT 'purchases' UNION ALL
              SELECT 'inventory' UNION ALL
              SELECT 'payments' UNION ALL
              SELECT 'finance' UNION ALL
              SELECT 'backup'
            ) m
            CROSS JOIN (
              SELECT 'view' AS action UNION ALL
              SELECT 'create' UNION ALL
              SELECT 'edit' UNION ALL
              SELECT 'cancel'
            ) a
           WHERE r.name = 'Staff';

        DELETE FROM roles
          WHERE name NOT IN ('Administrator', 'Staff');

        -- Removed features. Children before parents.
        DROP TABLE IF EXISTS bundle_components;
        DROP TABLE IF EXISTS product_bundles;
        DROP TABLE IF EXISTS warranty_claims;
        DROP TABLE IF EXISTS serial_units;
        DROP TABLE IF EXISTS service_visits;
        DROP TABLE IF EXISTS filter_schedules;
        DROP TABLE IF EXISTS installations;
        DROP TABLE IF EXISTS service_contracts;
        DROP TABLE IF EXISTS cheques;
        DROP TABLE IF EXISTS period_closures;
        DROP TABLE IF EXISTS period_locks;
        DROP TABLE IF EXISTS onboarding_steps;
        DROP TABLE IF EXISTS supplier_bills;
        DROP TABLE IF EXISTS licences;
        DROP TABLE IF EXISTS audit_log;
      `);

      // The role rewrite ran with enforcement off, so prove the ledger that
      // remains is still internally consistent.
      const violations = db.pragma("foreign_key_check") as unknown[];
      if (violations.length > 0) {
        throw new Error(
          `simplify migration left ${violations.length} referential integrity violation(s)`,
        );
      }
    },
  },
  {
    version: 19,
    name: "019_opening_movements_and_document_discount",
    /**
     * Two additive changes:
     *
     *  1. Adds a document-level discount column. The sale/purchase totals
     *     panel now carries a discount field, so the amount has to be stored
     *     on the document rather than re-derived at read time.
     *
     *  2. Widens the stock_movements.kind CHECK to include 'opening'. A product
     *     created with an opening quantity gets an opening movement so its
     *     stock is explained by the ledger exactly like every other movement,
     *     and stock remains the sum of movements.
     *
     * SQLite cannot ALTER a CHECK constraint, so the second change rebuilds
     * the table with the documented create-copy-drop-rename procedure. The
     * copy is a straight INSERT ... SELECT of every column, so existing rows,
     * ids and values are preserved. Foreign keys are switched off by the
     * migration runner around this migration because dropping a parent table
     * that other tables reference would otherwise fail.
     */
    requiresForeignKeysOff: true,
    up: (db) => {
      db.exec(`
        ALTER TABLE documents ADD COLUMN discount_fils INTEGER NOT NULL DEFAULT 0;

        CREATE TABLE stock_movements_new (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id       INTEGER NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
          document_id      INTEGER REFERENCES documents (id) ON DELETE SET NULL,
          document_line_id INTEGER REFERENCES document_lines (id) ON DELETE SET NULL,
          movement_date    TEXT    NOT NULL,
          kind             TEXT    NOT NULL
                             CHECK (kind IN ('receipt','issue','reversal','adjustmentIn','adjustmentOut','opening')),
          quantity_milli   INTEGER NOT NULL,
          unit_cost_fils   INTEGER NOT NULL DEFAULT 0,
          cost_fils        INTEGER NOT NULL DEFAULT 0,
          reverses_id      INTEGER REFERENCES stock_movements (id) ON DELETE RESTRICT,
          notes            TEXT,
          fiscal_year      INTEGER
        );

        INSERT INTO stock_movements_new (
          id, product_id, document_id, document_line_id, movement_date, kind,
          quantity_milli, unit_cost_fils, cost_fils, reverses_id, notes, fiscal_year
        )
        SELECT
          id, product_id, document_id, document_line_id, movement_date, kind,
          quantity_milli, unit_cost_fils, cost_fils, reverses_id, notes, fiscal_year
        FROM stock_movements;

        DROP TABLE stock_movements;
        ALTER TABLE stock_movements_new RENAME TO stock_movements;

        CREATE INDEX idx_movements_product ON stock_movements (product_id, movement_date);
        CREATE INDEX idx_movements_date    ON stock_movements (movement_date);
        CREATE INDEX idx_movements_doc     ON stock_movements (document_id);
        CREATE INDEX idx_movements_fy      ON stock_movements (fiscal_year, kind);
      `);

      const violations = db.pragma("foreign_key_check") as unknown[];
      if (violations.length > 0) {
        throw new Error(
          `opening_movements migration left ${violations.length} referential integrity violation(s)`,
        );
      }
    },
  },
  {
    version: 20,
    name: "020_user_profile_fields",
    /**
     * Everything a signed-in person can say about themselves.
     *
     * Three nullable columns on `users`. Nullable, and defaulting to NULL,
     * because every row that exists today predates them - a profile page that had
     * to invent values to fill a NOT NULL column would be writing fiction into a
     * real shop's database.
     *
     * `avatar_path` holds a file name, never a full path. The image is copied
     * into the application's own avatars folder when it is chosen, so the row
     * stays valid if the data directory moves or the shop restores a backup, and
     * a tampered value cannot aim the reader at an arbitrary file elsewhere on
     * the disk.
     *
     * Adding columns is additive: existing rows keep their values and ids.
     */
    up: (db) => {
      db.exec(`
        ALTER TABLE users ADD COLUMN email       TEXT;
        ALTER TABLE users ADD COLUMN phone       TEXT;
        ALTER TABLE users ADD COLUMN avatar_path TEXT;
      `);
    },
  },
  {
    version: 21,
    name: "021_double_entry_accounting",
    /**
     * The accounting engine: a Chart of Accounts, a journal, and accounting
     * periods.
     *
     * Everything here is additive and touches nothing the inventory tables
     * already hold. `documents`, `payments` and `expenses` keep their existing
     * meaning; the journal is a *second* record of the same events, not a
     * replacement for them, so a report can be rebuilt from the ledger and the
     * business screens can keep working untouched.
     *
     * Money is integer fils everywhere, matching `documents` and `payments`, so
     * nothing crosses this boundary as a float.
     *
     * `normal_balance` is stored rather than derived: it is what makes a
     * balance read correctly, and a sub-account of an unusual type (a
     * contra-expense, say) can differ from its parent.
     *
     * `journal_entries.source_key` is UNIQUE and is what makes posting
     * idempotent. It carries the origin of the entry ("sale:41"), so a retried
     * request collides instead of posting a second time.
     *
     * `journal_lines` refuses a line that is neither a debit nor a credit, and
     * refuses a zero line. Both constraints are in the schema rather than only
     * in application code, so a hand-written insert cannot bypass them.
     */
    up: (db) => {
      db.exec(`
        CREATE TABLE accounts (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          code          TEXT    NOT NULL UNIQUE,
          name          TEXT    NOT NULL,
          type          TEXT    NOT NULL
                          CHECK (type IN ('asset','liability','equity','income','expense')),
          -- Sub-classification used by the reports to group lines.
          subtype       TEXT,
          parent_id     INTEGER REFERENCES accounts (id) ON DELETE RESTRICT,
          normal_balance TEXT   NOT NULL CHECK (normal_balance IN ('debit','credit')),
          -- A system account is one the postings depend on by code. It may be
          -- renamed and deactivated, never retyped or deleted.
          is_system     INTEGER NOT NULL DEFAULT 0,
          is_active     INTEGER NOT NULL DEFAULT 1,
          description   TEXT,
          created_at    TEXT    NOT NULL,
          updated_at    TEXT    NOT NULL
        );

        CREATE TABLE accounting_periods (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT    NOT NULL UNIQUE,
          start_date TEXT    NOT NULL,
          end_date   TEXT    NOT NULL,
          status     TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
          closed_at  TEXT,
          closed_by  TEXT,
          CHECK (end_date >= start_date)
        );

        CREATE TABLE journal_entries (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_no          TEXT    NOT NULL UNIQUE,
          entry_date        TEXT    NOT NULL,
          reference         TEXT,
          description       TEXT    NOT NULL,
          source            TEXT    NOT NULL
                            CHECK (source IN ('purchase','sale','payment','expense','manual',
                                              'transfer','opening','reversal','adjustment')),
          status            TEXT    NOT NULL DEFAULT 'posted'
                            CHECK (status IN ('draft','posted','reversed')),
          -- Origin of the entry, e.g. 'sale:41'. UNIQUE is the idempotency guard.
          source_key        TEXT    UNIQUE,
          reverses_entry_id INTEGER REFERENCES journal_entries (id) ON DELETE RESTRICT,
          reversed_by_entry_id INTEGER REFERENCES journal_entries (id) ON DELETE SET NULL,
          total_debit_fils  INTEGER NOT NULL DEFAULT 0,
          total_credit_fils INTEGER NOT NULL DEFAULT 0,
          fiscal_year       INTEGER,
          created_by        TEXT,
          created_at        TEXT    NOT NULL,
          updated_at        TEXT    NOT NULL,
          -- A posted entry is balanced by construction; the engine checks this
          -- too, but the row must never be able to disagree with its own lines.
          CHECK (total_debit_fils = total_credit_fils)
        );

        CREATE TABLE journal_lines (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_id     INTEGER NOT NULL REFERENCES journal_entries (id) ON DELETE CASCADE,
          line_no      INTEGER NOT NULL,
          account_id   INTEGER NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
          description  TEXT,
          debit_fils   INTEGER NOT NULL DEFAULT 0 CHECK (debit_fils >= 0),
          credit_fils  INTEGER NOT NULL DEFAULT 0 CHECK (credit_fils >= 0),
          -- Where the money came from, so a subledger line can be traced back.
          party_id     INTEGER REFERENCES parties (id) ON DELETE SET NULL,
          document_id  INTEGER REFERENCES documents (id) ON DELETE SET NULL,
          UNIQUE (entry_id, line_no),
          -- A line is exactly one side, never zero and never both. This table
          -- constraint goes after the column list on purpose: SQLite mis-reads a
          -- bare CHECK sitting among the columns and reports a syntax error on
          -- whichever column happens to follow it.
          CHECK ((debit_fils > 0 AND credit_fils = 0) OR (credit_fils > 0 AND debit_fils = 0))
        );

        CREATE INDEX idx_accounts_type     ON accounts (type, is_active);
        CREATE INDEX idx_accounts_parent   ON accounts (parent_id);
        CREATE INDEX idx_accounts_code     ON accounts (code);
        CREATE INDEX idx_periods_range     ON accounting_periods (start_date, end_date);
        -- Prefixed with journal_ because idx_lines_document and
        -- idx_allocations_* are already taken by document_lines and payments.
        CREATE INDEX idx_journal_entries_date    ON journal_entries (entry_date);
        CREATE INDEX idx_journal_entries_source  ON journal_entries (source);
        CREATE INDEX idx_journal_entries_status  ON journal_entries (status);
        CREATE INDEX idx_journal_lines_account   ON journal_lines (account_id);
        CREATE INDEX idx_journal_lines_entry     ON journal_lines (entry_id);
        CREATE INDEX idx_journal_lines_party     ON journal_lines (party_id);
        CREATE INDEX idx_journal_lines_document  ON journal_lines (document_id);
      `);
    },
  },
  {
    version: 22,
    name: "022_finance_module",
    /**
     * Everything the Finance module needs on top of the accounting engine.
     *
     * All of it is additive. No existing row is rewritten and no existing
     * column changes meaning, so a shop that has been trading for a year comes
     * through this migration with its documents, payments and expenses exactly
     * as they were.
     *
     * The columns and why each one exists:
     *
     *  - `payments.document_payment` marks a payment that was raised *by* a
     *    document (the amount typed into the invoice form) rather than taken
     *    separately. Such a payment is already the cash leg of the document's
     *    own journal entry, so it must not post a second entry. Without this
     *    flag the same money would be counted twice.
     *
     *  - `payments.cash_account_code` says which cash or bank ledger the money
     *    landed in. A method is not an account: "bank transfer" settles
     *    through the bank ledger, "cash" through the till. The code is stored
     *    so the ledger can be chosen explicitly rather than inferred.
     *
     *  - `expenses.account_code` links an expense to a Chart of Accounts
     *    account, so the expense can be posted to a real account instead of a
     *    hard-wired category. A null value means "use the category default",
     *    which is what every expense recorded before this migration means.
     *
     *  - `expenses.paid_fils` is how much of the expense has been paid. The
     *    unpaid part is a liability, and an expense that has not been paid
     *    yet must not credit cash.
     *
     * The indexes are the ones the Finance screens actually query: journal
     * entries by date and status together, journal lines by account and entry
     * together, documents by due date for the aging reports, and payments by
     * date for the cash book.
     */
    up: (db) => {
      db.exec(`
        ALTER TABLE payments ADD COLUMN document_payment INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE payments ADD COLUMN cash_account_code TEXT;

        ALTER TABLE expenses ADD COLUMN account_code TEXT;
        ALTER TABLE expenses ADD COLUMN paid_fils INTEGER NOT NULL DEFAULT 0;

        -- An expense recorded before this column existed was paid when it was
        -- recorded: the app credited cash at the time. Leaving these at zero
        -- would make every old expense look unpaid and put a liability on the
        -- balance sheet that was never owed. Setting them to the amount they
        -- were is reading what the record already says, not inventing a
        -- figure.
        UPDATE expenses SET paid_fils = amount_fils WHERE paid_fils = 0;

        CREATE INDEX idx_journal_entries_date_status ON journal_entries (entry_date, status);
        CREATE INDEX idx_journal_lines_account_entry ON journal_lines (account_id, entry_id);
        CREATE INDEX idx_documents_due_date  ON documents (due_date);
        CREATE INDEX idx_payments_date       ON payments (payment_date);
        CREATE INDEX idx_expenses_account    ON expenses (account_code);
        CREATE INDEX idx_journal_entries_source_key ON journal_entries (source_key);
      `);
    },
  },
  {
    version: 23,
    name: "023_partner_share_is_a_share_of_net_profit",
    /**
     * A partner's share is now a percentage of the net profit, not a weight on
     * what is left after the donation.
     *
     * Under the old rule a share of 50 meant "half of the 98% that was left",
     * which is 49% of the profit - so the report showed 50% next to an amount
     * that was 49% of the profit, and 50 + 50 + 2 came to 102%. The donation
     * and the shares are now percentages of the same base and have to come to
     * 100% between them: a 2% donation with two partners at 49% each.
     *
     * The rows are rescaled rather than rewritten from scratch. The old share
     * was a weight on the remainder, so the same amount is reached by scaling
     * it by the share of the profit the donation leaves behind:
     *
     *     new share = old share x (100 - donation) / 100
     *
     * A 50/50 partnership with a 2% donation becomes 49/49, and the money
     * each partner receives is exactly what it received before. No financial
     * record is touched: the partners table holds configuration, not
     * transactions, and `partner_transactions` - the partnership's own ledger -
     * is left alone.
     *
     * A partnership with no partners at all is seeded with the two partners
     * this business agreed at 49% each, so the split works from the first day
     * instead of showing nothing until somebody types the names in.
     */
    up: (db) => {
      const donationRow = db
        .prepare("SELECT value FROM settings WHERE key = 'donation_rate_percent'")
        .get() as { value: string } | undefined;

      const configured = Number(donationRow?.value);
      const donation = Number.isFinite(configured) ? Math.min(Math.max(configured, 0), 50) : 2;
      const factor = (100 - donation) / 100;

      const partners = db.prepare("SELECT id, share_percent FROM partners").all() as {
        id: number;
        share_percent: number;
      }[];

      for (const partner of partners) {
        const scaled = Math.round(partner.share_percent * factor * 10_000) / 10_000;
        db.prepare("UPDATE partners SET share_percent = ? WHERE id = ?").run(scaled, partner.id);
      }

      if (partners.length === 0) {
        const now = new Date().toISOString();
        const insert = db.prepare(
          "INSERT INTO partners (name, share_percent, is_active, created_at) VALUES (?, ?, 1, ?)",
        );
        insert.run("Partner one", (100 - donation) / 2, now);
        insert.run("Partner two", (100 - donation) / 2, now);
      }    },
  },
];