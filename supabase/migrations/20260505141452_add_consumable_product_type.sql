/*
  # Add 'consumable' Product Type

  ## Summary
  Adds a third product type — `consumable` — for warehouse materials such as
  takeaway boxes, napkins, wipes, straws, bags, and other non-food supplies
  that are purchased from suppliers but are not ingredients and do not enter
  production or recipes.

  ## Changes
  - `products.product_type` check constraint extended to allow `'consumable'`

  ## Notes
  - Existing rows are unaffected (they remain `purchased` or `cdp_produced`)
  - Consumable products behave like purchased products for ordering/receiving
    but are excluded from recipe/production flows
*/

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_product_type_check;

ALTER TABLE products
  ADD CONSTRAINT products_product_type_check
  CHECK (product_type = ANY (ARRAY['cdp_produced'::text, 'purchased'::text, 'consumable'::text]));
