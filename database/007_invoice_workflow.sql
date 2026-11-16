-- Basic manual invoice workflow. Apply once after 005; no API role grants.
BEGIN;
ALTER TABLE restaurant.invoices
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN tax_amount numeric(18,4) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0 AND tax_amount < 'Infinity'::numeric),
  ADD COLUMN shipping_amount numeric(18,4) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0 AND shipping_amount < 'Infinity'::numeric),
  ADD COLUMN discount_amount numeric(18,4) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0 AND discount_amount < 'Infinity'::numeric);
ALTER TABLE restaurant.invoice_lines
  ADD COLUMN supplier_item_id uuid,
  ADD COLUMN quantity_per_pack_base numeric(18,6),
  ADD FOREIGN KEY (brand_id, supplier_item_id) REFERENCES restaurant.supplier_items(brand_id, id),
  ADD CHECK (supplier_item_id IS NULL OR (ingredient_id IS NOT NULL AND quantity_per_pack_base > 0 AND quantity_per_pack_base < 'Infinity'::numeric AND quantity_per_pack_base IS NOT NULL));
CREATE UNIQUE INDEX invoices_one_receipt_key ON restaurant.invoices(receipt_id) WHERE receipt_id IS NOT NULL;
CREATE UNIQUE INDEX invoices_approved_hash_key ON restaurant.invoices(brand_id, document_sha256)
  WHERE status = 'approved' AND document_sha256 IS NOT NULL;

CREATE FUNCTION restaurant.guard_reviewed_invoice() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.status <> 'needs_review' THEN
    -- A reviewed invoice is immutable except for its first receipt link/revision.
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Reviewed invoices are immutable'; END IF;
    IF OLD.status <> 'approved' OR OLD.receipt_id IS NOT NULL OR NEW.receipt_id IS NULL
      OR (to_jsonb(NEW) - 'receipt_id' - 'revision') IS DISTINCT FROM (to_jsonb(OLD) - 'receipt_id' - 'revision') THEN
      RAISE EXCEPTION 'Reviewed invoices are immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_invoice BEFORE UPDATE OR DELETE ON restaurant.invoices
  FOR EACH ROW EXECUTE FUNCTION restaurant.guard_reviewed_invoice();

CREATE FUNCTION restaurant.guard_invoice_line() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE parent_id uuid; parent_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.invoice_id <> OLD.invoice_id THEN RAISE EXCEPTION 'Cannot move invoice lines'; END IF;
  IF TG_OP = 'DELETE' THEN parent_id := OLD.invoice_id; ELSE parent_id := NEW.invoice_id; END IF;
  SELECT status INTO parent_status FROM restaurant.invoices WHERE id = parent_id FOR UPDATE;
  IF parent_status <> 'needs_review' THEN RAISE EXCEPTION 'Reviewed invoice lines are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_invoice_lines BEFORE INSERT OR UPDATE OR DELETE ON restaurant.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION restaurant.guard_invoice_line();
CREATE TRIGGER guard_review_events BEFORE UPDATE OR DELETE ON restaurant.invoice_review_events
  FOR EACH ROW EXECUTE FUNCTION restaurant.guard_ledger();
COMMIT;
