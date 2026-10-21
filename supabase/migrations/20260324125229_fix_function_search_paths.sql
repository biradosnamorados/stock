/*
  # Fix Function Search Paths for Security

  1. Security Improvements
    - Set explicit search_path for all security definer functions
    - Prevents search_path manipulation attacks
    - Ensures functions always execute with correct schema context

  2. Functions Updated
    - get_product_stock
    - generate_order_number
    - generate_internal_order_number
    - generate_receipt_number
    - update_stock_on_receipt
    - get_latest_price
    - check_product_dependencies
    - is_admin
    - current_user_unit_id
*/

-- Fix get_product_stock
CREATE OR REPLACE FUNCTION public.get_product_stock(p_product_id uuid, p_unit_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stock numeric;
BEGIN
  SELECT COALESCE(SUM(quantity), 0)
  INTO v_stock
  FROM product_stock
  WHERE product_id = p_product_id AND unit_id = p_unit_id;
  
  RETURN v_stock;
END;
$$;

-- Fix generate_order_number
CREATE OR REPLACE FUNCTION public.generate_order_number(p_unit_id uuid)
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
  FROM purchase_orders
  WHERE unit_id = p_unit_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE);
  
  RETURN v_unit_code || '-PO-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(v_count::text, 4, '0');
END;
$$;

-- Fix generate_internal_order_number
CREATE OR REPLACE FUNCTION public.generate_internal_order_number(p_from_unit_id uuid, p_to_unit_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_from_code text;
  v_to_code text;
BEGIN
  SELECT code INTO v_from_code FROM units WHERE id = p_from_unit_id;
  SELECT code INTO v_to_code FROM units WHERE id = p_to_unit_id;
  
  SELECT COUNT(*) + 1 INTO v_count
  FROM internal_orders
  WHERE from_unit_id = p_from_unit_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE);
  
  RETURN v_from_code || '-' || v_to_code || '-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(v_count::text, 4, '0');
END;
$$;

-- Fix generate_receipt_number
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
    AND EXTRACT(YEAR FROM received_date) = EXTRACT(YEAR FROM CURRENT_DATE);
  
  RETURN v_unit_code || '-GR-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(v_count::text, 4, '0');
END;
$$;

-- Fix update_stock_on_receipt
CREATE OR REPLACE FUNCTION public.update_stock_on_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO product_stock (product_id, unit_id, quantity)
  VALUES (NEW.product_id, (SELECT unit_id FROM goods_receipts WHERE id = NEW.receipt_id), NEW.received_quantity)
  ON CONFLICT (product_id, unit_id)
  DO UPDATE SET quantity = product_stock.quantity + NEW.received_quantity;
  
  RETURN NEW;
END;
$$;

-- Fix get_latest_price
CREATE OR REPLACE FUNCTION public.get_latest_price(p_product_id uuid, p_unit_id uuid, p_supplier_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_price numeric;
BEGIN
  SELECT unit_price
  INTO v_price
  FROM product_price_history
  WHERE product_id = p_product_id
    AND unit_id = p_unit_id
    AND supplier_id = p_supplier_id
  ORDER BY recorded_at DESC
  LIMIT 1;
  
  RETURN COALESCE(v_price, 0);
END;
$$;

-- Fix check_product_dependencies
CREATE OR REPLACE FUNCTION public.check_product_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM purchase_order_lines
  WHERE product_id = OLD.id;
  
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete product with existing purchase order lines';
  END IF;
  
  RETURN OLD;
END;
$$;

-- Fix is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN v_role = 'admin';
END;
$$;

-- Fix current_user_unit_id
CREATE OR REPLACE FUNCTION public.current_user_unit_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unit_id uuid;
BEGIN
  SELECT unit_id INTO v_unit_id
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN v_unit_id;
END;
$$;
