-- Project 1 | Invoice data model supplement | 2026-11-09
-- Run ONCE after 001_schema.sql as the development database owner.
-- Schema only: no OCR, API, approval service, file upload service or stock posting.
-- Existing receipt/sales functions, rows and permissions are preserved.
BEGIN;

-- Ensures a linked receipt belongs to the invoice's brand, supplier and location.
ALTER TABLE restaurant.purchase_receipts
  ADD CONSTRAINT receipt_invoice_match_key UNIQUE (brand_id, id, supplier_id, location_id);

CREATE TABLE restaurant.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  location_id uuid NOT NULL,
  supplier_id uuid,
  receipt_id uuid,
  invoice_number text CHECK (invoice_number IS NULL OR btrim(invoice_number) <> ''),
  invoice_date date,
  total_amount numeric(18,4) CHECK (total_amount >= 0 AND total_amount < 'Infinity'::numeric),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'needs_review'
    CHECK (status IN ('needs_review', 'approved', 'rejected', 'duplicate')),
  original_file_name text,
  document_storage_path text,
  document_sha256 text CHECK (document_sha256 ~ '^[a-f0-9]{64}$'),
  review_note text,
  reviewed_by text CHECK (reviewed_by IS NULL OR btrim(reviewed_by) <> ''),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (brand_id, location_id) REFERENCES restaurant.locations(brand_id, id),
  FOREIGN KEY (brand_id, supplier_id) REFERENCES restaurant.suppliers(brand_id, id),
  FOREIGN KEY (brand_id, receipt_id, supplier_id, location_id)
    REFERENCES restaurant.purchase_receipts(brand_id, id, supplier_id, location_id),
  UNIQUE (brand_id, id),
  CHECK (receipt_id IS NULL OR supplier_id IS NOT NULL),
  CHECK (status <> 'approved' OR (
    supplier_id IS NOT NULL AND invoice_number IS NOT NULL AND invoice_date IS NOT NULL
    AND total_amount > 0 AND total_amount IS NOT NULL
    AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
  ))
);

-- Keep duplicate uploads for review, but reject a second approved invoice number
-- for the same brand/supplier, including at another location. Matching is trimmed
-- and case-insensitive. Hash matching is an indexed lookup, not an OCR detector.
CREATE UNIQUE INDEX invoices_approved_number_key
  ON restaurant.invoices (brand_id, supplier_id, lower(btrim(invoice_number)))
  WHERE status = 'approved';
CREATE INDEX invoices_review_queue_idx ON restaurant.invoices (brand_id, location_id, status);
CREATE INDEX invoices_document_hash_idx ON restaurant.invoices (brand_id, document_sha256)
  WHERE document_sha256 IS NOT NULL;

CREATE TABLE restaurant.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  description text NOT NULL CHECK (btrim(description) <> ''),
  ingredient_id uuid,
  quantity numeric(18,6) CHECK (quantity > 0 AND quantity < 'Infinity'::numeric),
  unit_label text,
  unit_price numeric(18,4) CHECK (unit_price >= 0 AND unit_price < 'Infinity'::numeric),
  line_total numeric(18,4) CHECK (line_total >= 0 AND line_total < 'Infinity'::numeric),
  FOREIGN KEY (brand_id, invoice_id) REFERENCES restaurant.invoices(brand_id, id),
  FOREIGN KEY (brand_id, ingredient_id) REFERENCES restaurant.ingredients(brand_id, id),
  UNIQUE (invoice_id, line_number)
);

-- An application will later write these events alongside its review actions.
-- This table alone does not implement automatic auditing or reviewer identity.
CREATE TABLE restaurant.invoice_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('saved', 'approved', 'rejected', 'duplicate_flagged')),
  reviewer_label text NOT NULL CHECK (btrim(reviewer_label) <> ''),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (brand_id, invoice_id) REFERENCES restaurant.invoices(brand_id, id)
);
CREATE INDEX invoice_review_events_parent_idx ON restaurant.invoice_review_events (invoice_id, created_at);

ALTER TABLE restaurant.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant.invoice_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON restaurant.invoices, restaurant.invoice_lines, restaurant.invoice_review_events FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON restaurant.invoices, restaurant.invoice_lines, restaurant.invoice_review_events FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
COMMIT;
