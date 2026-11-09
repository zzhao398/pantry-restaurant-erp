-- Run after 001_schema.sql and 002_demo.sql in the Supabase SQL Editor.
-- Read-only verification: every row should have passed = true.
-- Demo balance checks assume the untouched fictional demonstration data.
WITH expected(location_name, ingredient_name, expected_quantity) AS (
  VALUES ('Manhattan demo', 'Rice', 7000::numeric),
         ('Manhattan demo', 'Chicken', 3000::numeric),
         ('Queens demo', 'Rice', 4000::numeric),
         ('Queens demo', 'Chicken', 0::numeric)
), checks AS (
  SELECT 'Schema contains 12 tables' AS check_name,
    count(*) = 12 AS passed, count(*)::text AS actual
  FROM pg_tables WHERE schemaname = 'restaurant'
  UNION ALL
  SELECT 'All 12 tables have RLS enabled', count(*) = 12 AND bool_and(c.relrowsecurity),
    count(*) FILTER (WHERE c.relrowsecurity)::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'restaurant' AND c.relkind = 'r'
  UNION ALL
  SELECT 'Demo: ' || e.location_name || ' / ' || e.ingredient_name,
    coalesce(a.quantity_on_hand = e.expected_quantity, false),
    coalesce(a.quantity_on_hand::text, 'MISSING')
  FROM expected e LEFT JOIN restaurant.inventory_on_hand a
    ON a.location_name = e.location_name AND a.ingredient_name = e.ingredient_name
    AND a.brand_id = '10000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'Demo has 5 inventory movements', count(*) = 5, count(*)::text
  FROM restaurant.inventory_movements
  WHERE brand_id = '10000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'Both demo receipts are posted', count(*) = 2 AND bool_and(status = 'posted'), count(*)::text
  FROM restaurant.purchase_receipts
  WHERE id IN ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002')
  UNION ALL
  SELECT 'Demo sales batch is posted', count(*) = 1 AND bool_and(status = 'posted'), count(*)::text
  FROM restaurant.sales_batches WHERE id = '80000000-0000-0000-0000-000000000001'
  UNION ALL
  SELECT 'API role cannot access private schema: ' || r.rolname,
    NOT has_schema_privilege(r.oid, 'restaurant', 'USAGE'),
    has_schema_privilege(r.oid, 'restaurant', 'USAGE')::text
  FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated')
)
SELECT check_name, passed, actual FROM checks ORDER BY check_name;
