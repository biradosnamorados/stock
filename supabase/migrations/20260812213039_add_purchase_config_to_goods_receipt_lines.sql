ALTER TABLE goods_receipt_lines
  ADD COLUMN IF NOT EXISTS purchase_config_id uuid REFERENCES product_purchase_configs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_unit text,
  ADD COLUMN IF NOT EXISTS purchase_unit_quantity numeric;