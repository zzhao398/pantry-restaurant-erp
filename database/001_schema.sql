-- Project 1 | Restaurant purchasing and inventory | Draft v0.1 | 2026-11-01
-- Run ONCE in a new development database as its owner (e.g. Supabase SQL Editor).
-- Private, admin-only prototype. No customer-facing API grants or auth policies yet.
-- This migration is transactional and does not overwrite an existing schema.
BEGIN;
CREATE SCHEMA restaurant;
REVOKE ALL ON SCHEMA restaurant FROM PUBLIC;

CREATE TABLE restaurant.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE restaurant.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES restaurant.brands(id),
  code text NOT NULL CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  address text,
  timezone text NOT NULL DEFAULT 'America/New_York',
  UNIQUE (brand_id, id), UNIQUE (brand_id, code)
);

CREATE TABLE restaurant.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES restaurant.brands(id),
  name text NOT NULL CHECK (btrim(name) <> ''),
  contact_email text,
  UNIQUE (brand_id, id)
);

CREATE TABLE restaurant.ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES restaurant.brands(id),
  name text NOT NULL CHECK (btrim(name) <> ''),
  base_unit text NOT NULL CHECK (base_unit IN ('g', 'ml', 'each')),
  UNIQUE (brand_id, id), UNIQUE (brand_id, name)
);

CREATE TABLE restaurant.supplier_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES restaurant.brands(id),
  supplier_id uuid NOT NULL,
  ingredient_id uuid NOT NULL,
  supplier_sku text NOT NULL CHECK (btrim(supplier_sku) <> ''),
  pack_label text NOT NULL,
  quantity_per_pack_base numeric(18,6) NOT NULL CHECK (quantity_per_pack_base > 0),
  FOREIGN KEY (brand_id, supplier_id) REFERENCES restaurant.suppliers(brand_id, id),
  FOREIGN KEY (brand_id, ingredient_id) REFERENCES restaurant.ingredients(brand_id, id),
  UNIQUE (brand_id, id), UNIQUE (brand_id, supplier_id, supplier_sku),
  UNIQUE (brand_id, id, supplier_id, ingredient_id)
);

CREATE TABLE restaurant.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES restaurant.brands(id),
  name text NOT NULL CHECK (btrim(name) <> ''),
  UNIQUE (brand_id, id), UNIQUE (brand_id, name)
);

CREATE TABLE restaurant.recipe_items (
  brand_id uuid NOT NULL,
  menu_item_id uuid NOT NULL,
  ingredient_id uuid NOT NULL,
  quantity_base_per_serving numeric(18,6) NOT NULL CHECK (quantity_base_per_serving > 0),
  PRIMARY KEY (brand_id, menu_item_id, ingredient_id),
  FOREIGN KEY (brand_id, menu_item_id) REFERENCES restaurant.menu_items(brand_id, id),
  FOREIGN KEY (brand_id, ingredient_id) REFERENCES restaurant.ingredients(brand_id, id)
);

CREATE TABLE restaurant.purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  location_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  source_reference text NOT NULL CHECK (btrim(source_reference) <> ''),
  invoice_reference text,
  received_on date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
  posted_at timestamptz,
  FOREIGN KEY (brand_id, location_id) REFERENCES restaurant.locations(brand_id, id),
  FOREIGN KEY (brand_id, supplier_id) REFERENCES restaurant.suppliers(brand_id, id),
  UNIQUE (brand_id, id), UNIQUE (brand_id, id, supplier_id),
  UNIQUE (brand_id, location_id, supplier_id, source_reference),
  CHECK ((status = 'draft' AND posted_at IS NULL) OR (status = 'posted' AND posted_at IS NOT NULL))
);

CREATE TABLE restaurant.purchase_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  supplier_item_id uuid NOT NULL,
  ingredient_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  packs_received numeric(18,6) NOT NULL CHECK (packs_received > 0),
  -- Snapshot: a later change to supplier pack size must not rewrite history.
  quantity_per_pack_base numeric(18,6) NOT NULL CHECK (quantity_per_pack_base > 0),
  unit_pack_cost numeric(18,4) CHECK (unit_pack_cost >= 0),
  FOREIGN KEY (brand_id, receipt_id, supplier_id)
    REFERENCES restaurant.purchase_receipts(brand_id, id, supplier_id),
  FOREIGN KEY (brand_id, supplier_item_id, supplier_id, ingredient_id)
    REFERENCES restaurant.supplier_items(brand_id, id, supplier_id, ingredient_id),
  UNIQUE (brand_id, id), UNIQUE (receipt_id, line_number)
);

CREATE TABLE restaurant.sales_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  location_id uuid NOT NULL,
  business_date date NOT NULL,
  source_reference text NOT NULL CHECK (btrim(source_reference) <> ''),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
  posted_at timestamptz,
  FOREIGN KEY (brand_id, location_id) REFERENCES restaurant.locations(brand_id, id),
  UNIQUE (brand_id, id), UNIQUE (brand_id, location_id, source_reference),
  CHECK ((status = 'draft' AND posted_at IS NULL) OR (status = 'posted' AND posted_at IS NOT NULL))
);

CREATE TABLE restaurant.sales_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  menu_item_id uuid NOT NULL,
  servings numeric(18,6) NOT NULL CHECK (servings > 0),
  FOREIGN KEY (brand_id, batch_id) REFERENCES restaurant.sales_batches(brand_id, id),
  FOREIGN KEY (brand_id, menu_item_id) REFERENCES restaurant.menu_items(brand_id, id),
  UNIQUE (brand_id, id), UNIQUE (batch_id, menu_item_id)
);

CREATE TABLE restaurant.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  location_id uuid NOT NULL,
  ingredient_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('receipt', 'sale')),
  -- Signed quantity in this ingredient's base unit; never mix grams and kilograms.
  quantity_base numeric(24,6) NOT NULL CHECK (quantity_base <> 0),
  business_date date NOT NULL,
  receipt_line_id uuid,
  sales_line_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (brand_id, location_id) REFERENCES restaurant.locations(brand_id, id),
  FOREIGN KEY (brand_id, ingredient_id) REFERENCES restaurant.ingredients(brand_id, id),
  FOREIGN KEY (brand_id, receipt_line_id) REFERENCES restaurant.purchase_receipt_lines(brand_id, id),
  FOREIGN KEY (brand_id, sales_line_id) REFERENCES restaurant.sales_lines(brand_id, id),
  UNIQUE (receipt_line_id), UNIQUE (sales_line_id, ingredient_id),
  CHECK ((movement_type = 'receipt' AND quantity_base > 0 AND receipt_line_id IS NOT NULL AND sales_line_id IS NULL)
      OR (movement_type = 'sale' AND quantity_base < 0 AND sales_line_id IS NOT NULL AND receipt_line_id IS NULL))
);
CREATE INDEX movements_balance_idx ON restaurant.inventory_movements(brand_id, location_id, ingredient_id);
CREATE INDEX receipt_lines_parent_idx ON restaurant.purchase_receipt_lines(receipt_id);
CREATE INDEX sales_lines_parent_idx ON restaurant.sales_lines(batch_id);

-- A ledger-derived balance avoids a second, potentially inconsistent stored total.
CREATE VIEW restaurant.inventory_on_hand WITH (security_invoker = true) AS
SELECT l.brand_id, l.id AS location_id, l.name AS location_name,
       i.id AS ingredient_id, i.name AS ingredient_name, i.base_unit,
       coalesce(sum(m.quantity_base), 0) AS quantity_on_hand,
       coalesce(sum(m.quantity_base), 0) < 0 AS needs_reconciliation
FROM restaurant.locations l
JOIN restaurant.ingredients i ON i.brand_id = l.brand_id
LEFT JOIN restaurant.inventory_movements m
  ON m.brand_id = l.brand_id AND m.location_id = l.id AND m.ingredient_id = i.id
GROUP BY l.brand_id, l.id, l.name, i.id, i.name, i.base_unit;

-- Do not edit a posted document; corrections will use a future reversal workflow.
CREATE FUNCTION restaurant.guard_posted_document() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.status = 'posted' THEN RAISE EXCEPTION 'Posted documents are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_receipt BEFORE UPDATE OR DELETE ON restaurant.purchase_receipts
  FOR EACH ROW EXECUTE FUNCTION restaurant.guard_posted_document();
CREATE TRIGGER guard_batch BEFORE UPDATE OR DELETE ON restaurant.sales_batches
  FOR EACH ROW EXECUTE FUNCTION restaurant.guard_posted_document();

-- Lock the parent while editing lines, so posting and line edits cannot interleave.
CREATE FUNCTION restaurant.guard_document_line() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE parent_id uuid; parent_status text;
BEGIN
  IF TG_TABLE_NAME = 'purchase_receipt_lines' THEN
    IF TG_OP = 'UPDATE' AND NEW.receipt_id <> OLD.receipt_id THEN
      RAISE EXCEPTION 'Cannot move a line to another receipt';
    END IF;
    IF TG_OP = 'DELETE' THEN parent_id := OLD.receipt_id; ELSE parent_id := NEW.receipt_id; END IF;
    SELECT status INTO parent_status FROM restaurant.purchase_receipts WHERE id = parent_id FOR UPDATE;
  ELSE
    IF TG_OP = 'UPDATE' AND NEW.batch_id <> OLD.batch_id THEN
      RAISE EXCEPTION 'Cannot move a line to another batch';
    END IF;
    IF TG_OP = 'DELETE' THEN parent_id := OLD.batch_id; ELSE parent_id := NEW.batch_id; END IF;
    SELECT status INTO parent_status FROM restaurant.sales_batches WHERE id = parent_id FOR UPDATE;
  END IF;
  IF parent_status = 'posted' THEN RAISE EXCEPTION 'Posted document lines are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_receipt_lines BEFORE INSERT OR UPDATE OR DELETE ON restaurant.purchase_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION restaurant.guard_document_line();
CREATE TRIGGER guard_sales_lines BEFORE INSERT OR UPDATE OR DELETE ON restaurant.sales_lines
  FOR EACH ROW EXECUTE FUNCTION restaurant.guard_document_line();

CREATE FUNCTION restaurant.guard_ledger() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Inventory ledger is append-only'; END $$;
CREATE TRIGGER guard_ledger BEFORE UPDATE OR DELETE ON restaurant.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION restaurant.guard_ledger();

CREATE FUNCTION restaurant.guard_base_unit() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.base_unit <> OLD.base_unit THEN
    RAISE EXCEPTION 'Base unit is immutable; create a new ingredient for a different unit';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_base_unit BEFORE UPDATE ON restaurant.ingredients
  FOR EACH ROW EXECUTE FUNCTION restaurant.guard_base_unit();

-- Both posting functions are SECURITY INVOKER. Caller needs owner/admin access.
-- A repeated call returns false without writing more movements.
CREATE FUNCTION restaurant.post_receipt(p_receipt_id uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE r restaurant.purchase_receipts%ROWTYPE;
BEGIN
  SELECT * INTO r FROM restaurant.purchase_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  IF r.status = 'posted' THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM restaurant.purchase_receipt_lines WHERE receipt_id = r.id) THEN
    RAISE EXCEPTION 'Cannot post an empty receipt';
  END IF;
  INSERT INTO restaurant.inventory_movements
    (brand_id, location_id, ingredient_id, movement_type, quantity_base, business_date, receipt_line_id)
  SELECT r.brand_id, r.location_id, ingredient_id, 'receipt',
         round(packs_received * quantity_per_pack_base, 6), r.received_on, id
  FROM restaurant.purchase_receipt_lines WHERE receipt_id = r.id;
  UPDATE restaurant.purchase_receipts SET status = 'posted', posted_at = now() WHERE id = r.id;
  RETURN true;
END $$;

CREATE FUNCTION restaurant.post_sales_batch(p_batch_id uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE b restaurant.sales_batches%ROWTYPE;
BEGIN
  SELECT * INTO b FROM restaurant.sales_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales batch not found'; END IF;
  IF b.status = 'posted' THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM restaurant.sales_lines WHERE batch_id = b.id) THEN
    RAISE EXCEPTION 'Cannot post an empty sales batch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM restaurant.sales_lines s WHERE s.batch_id = b.id
    AND NOT EXISTS (SELECT 1 FROM restaurant.recipe_items r
      WHERE r.brand_id = s.brand_id AND r.menu_item_id = s.menu_item_id)
  ) THEN RAISE EXCEPTION 'Every sold menu item needs a recipe before posting'; END IF;
  INSERT INTO restaurant.inventory_movements
    (brand_id, location_id, ingredient_id, movement_type, quantity_base, business_date, sales_line_id)
  SELECT b.brand_id, b.location_id, r.ingredient_id, 'sale',
         -round(s.servings * r.quantity_base_per_serving, 6), b.business_date, s.id
  FROM restaurant.sales_lines s JOIN restaurant.recipe_items r
    ON r.brand_id = s.brand_id AND r.menu_item_id = s.menu_item_id
  WHERE s.batch_id = b.id;
  UPDATE restaurant.sales_batches SET status = 'posted', posted_at = now() WHERE id = b.id;
  RETURN true;
END $$;

-- Private admin-only first milestone. Enable RLS now; user membership/policies are
-- a later milestone before browser/API access. Do not expose this schema yet.
DO $$
DECLARE t record; role_name text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'restaurant' LOOP
    EXECUTE format('ALTER TABLE restaurant.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    IF role_name = 'public' OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA restaurant FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA restaurant FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA restaurant FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
COMMIT;
