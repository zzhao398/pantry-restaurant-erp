-- Read-only checks for the original fictional development database, after 005.
SELECT '15 restaurant tables' AS check_name,
  (SELECT count(*) = 15 FROM pg_tables WHERE schemaname = 'restaurant') AS passed
UNION ALL SELECT 'All tables have RLS',
  (SELECT count(*) = 15 AND bool_and(rowsecurity) FROM pg_tables WHERE schemaname = 'restaurant')
UNION ALL SELECT 'Three invoice tables',
  (SELECT count(*) = 3 FROM pg_tables WHERE schemaname = 'restaurant'
    AND tablename IN ('invoices','invoice_lines','invoice_review_events'))
UNION ALL SELECT 'Approved duplicate protection',
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'restaurant' AND indexname = 'invoices_approved_number_key')
UNION ALL SELECT 'Invoice tables have no API grants',
  NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'restaurant' AND table_name IN ('invoices','invoice_lines','invoice_review_events')
    AND grantee IN ('PUBLIC','anon','authenticated'))
UNION ALL SELECT 'API schema access remains disabled',
  NOT has_schema_privilege('anon','restaurant','USAGE')
  AND NOT has_schema_privilege('authenticated','restaurant','USAGE')
UNION ALL SELECT 'Five original movements preserved',
  (SELECT count(*) = 5 FROM restaurant.inventory_movements)
UNION ALL SELECT 'Original branch balances preserved',
  (SELECT count(*) = 4 AND bool_and(quantity_on_hand = CASE
     WHEN location_name = 'Manhattan demo' AND ingredient_name = 'Rice' THEN 7000
     WHEN location_name = 'Manhattan demo' AND ingredient_name = 'Chicken' THEN 3000
     WHEN location_name = 'Queens demo' AND ingredient_name = 'Rice' THEN 4000
     WHEN location_name = 'Queens demo' AND ingredient_name = 'Chicken' THEN 0 ELSE -999999 END)
   FROM restaurant.inventory_on_hand)
UNION ALL SELECT 'No invoice test data left in hosted database',
  (SELECT count(*) = 0 FROM restaurant.invoices)
  AND (SELECT count(*) = 0 FROM restaurant.invoice_lines)
  AND (SELECT count(*) = 0 FROM restaurant.invoice_review_events);
