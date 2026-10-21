/*
  # Fix generate_receipt_number Function

  1. Changes
    - Update generate_receipt_number to use correct column name 'received_at' instead of 'received_date'
    
  2. Notes
    - The goods_receipts table uses 'received_at' not 'received_date'
    - This fixes the 400 error when creating goods receipts
*/

CREATE OR REPLACE FUNCTION public.generate_receipt_number(p_unit_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_unit_code text;
BEGIN
  SELECT code INTO v_unit_code FROM units WHERE id = p_unit_id;
  
  SELECT COUNT(*) + 1 INTO v_count
  FROM goods_receipts
  WHERE unit_id = p_unit_id
    AND EXTRACT(YEAR FROM received_at) = EXTRACT(YEAR FROM CURRENT_DATE);
  
  RETURN v_unit_code || '-GR-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(v_count::text, 4, '0');
END;
$$;