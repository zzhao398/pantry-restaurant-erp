-- Run after the untouched 002_demo.sql fixture.
-- Calls the posting functions again for already-posted documents.
-- A failure raises an error; a passing run keeps every demo quantity unchanged.
BEGIN;
DO $$
DECLARE before_count bigint; after_count bigint; receipt_posted boolean; sales_posted boolean;
BEGIN
  SELECT count(*) INTO before_count FROM restaurant.inventory_movements
    WHERE brand_id = '10000000-0000-0000-0000-000000000001';
  IF before_count <> 5 THEN RAISE EXCEPTION 'Expected the untouched five-movement demo'; END IF;
  receipt_posted := restaurant.post_receipt('70000000-0000-0000-0000-000000000001');
  sales_posted := restaurant.post_sales_batch('80000000-0000-0000-0000-000000000001');
  SELECT count(*) INTO after_count FROM restaurant.inventory_movements
    WHERE brand_id = '10000000-0000-0000-0000-000000000001';
  IF receipt_posted OR sales_posted OR before_count <> after_count THEN
    RAISE EXCEPTION 'Duplicate posting changed the inventory ledger';
  END IF;
  IF (SELECT quantity_on_hand FROM restaurant.inventory_on_hand
      WHERE location_id = '20000000-0000-0000-0000-000000000001'
        AND ingredient_id = '40000000-0000-0000-0000-000000000001') IS DISTINCT FROM 7000::numeric THEN
    RAISE EXCEPTION 'Manhattan rice balance changed';
  END IF;
END $$;
COMMIT;
SELECT 'Receipt and sales repeat posting made no changes' AS check_name,
       true AS passed, count(*) AS movement_count
FROM restaurant.inventory_movements
WHERE brand_id = '10000000-0000-0000-0000-000000000001';
