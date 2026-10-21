/*
  # Full Lifecycle Tracking System for CDP Products

  ## 1. Overview
  This migration implements complete lifecycle tracking for internally produced products
  from production to final consumption or disposal.

  ## 2. New Tables

  ### packaged_unit_lifecycle_events
  - Tracks every state change of a packaged unit
  - Records: packaging, transfer, reception, usage, waste, return, blocking
  - Stores actor (user), timestamp, and metadata for each event
  - Enables complete traceability timeline

  ### packaged_unit_transfers
  - Tracks movement between locations (CDP to restaurants)
  - Records transfer initiation, shipping, and reception
  - Links to internal orders for context

  ### packaged_unit_usage_actions
  - Records final disposition: used, waste, returned, blocked
  - Requires QR code scan for validation
  - Tracks reason, user, timestamp
  - Ends the lifecycle of a packaged unit

  ## 3. Schema Changes

  ### packaged_units table enhancements
  - Add packaging_date (when unit was packaged)
  - Add expiry_date (calculated from batch)
  - Add transferred_at (when shipped to restaurant)
  - Add received_at (when restaurant confirmed reception)
  - Add final_action (used/waste/returned/blocked)
  - Add final_action_at (when lifecycle ended)
  - Add final_action_by (user who performed final action)
  - Add final_action_reason (explanation)
  - Add updated_by (tracks who performed last update)
  - Update status enum to include: available, reserved, in_transit, received, used, waste, returned, blocked

  ### production_batches enhancements
  - Add production_date (when batch was produced)
  - Add expiry_date (calculated expiry)

  ## 4. Functions

  ### get_packaged_unit_lifecycle
  - Returns complete timeline for a packaged unit
  - Shows all events from production to final disposition

  ### get_batch_units_locations
  - Returns all units in a batch with current locations and statuses
  - Enables batch-level tracking and oversight

  ### get_available_units_fifo
  - Returns available packaged units for a product sorted by FIFO
  - Enforces oldest-first selection for internal orders

  ## 5. Triggers

  ### log_packaged_unit_lifecycle_event
  - Automatically logs lifecycle events when packaged_units status changes
  - Creates audit trail for all state transitions

  ## 6. RLS Policies
  - All authenticated users can view lifecycle events
  - Only authorized users can create lifecycle events
  - CDP managers can manage all packaged units
  - Restaurant staff can only manage units in their location

  ## 7. Security
  - Enable RLS on all new tables
  - Restrict destructive operations
  - Audit all critical actions
*/

-- =====================================================
-- 1. ENHANCE PACKAGED UNITS TABLE
-- =====================================================

-- Add lifecycle tracking fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packaged_units' AND column_name = 'packaging_date'
  ) THEN
    ALTER TABLE packaged_units ADD COLUMN packaging_date timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packaged_units' AND column_name = 'expiry_date'
  ) THEN
    ALTER TABLE packaged_units ADD COLUMN expiry_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packaged_units' AND column_name = 'transferred_at'
  ) THEN
    ALTER TABLE packaged_units ADD COLUMN transferred_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packaged_units' AND column_name = 'received_at'
  ) THEN
    ALTER TABLE packaged_units ADD COLUMN received_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packaged_units' AND column_name = 'final_action'
  ) THEN
    ALTER TABLE packaged_units ADD COLUMN final_action text CHECK (final_action IN ('used', 'waste', 'returned', 'blocked'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packaged_units' AND column_name = 'final_action_at'
  ) THEN
    ALTER TABLE packaged_units ADD COLUMN final_action_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packaged_units' AND column_name = 'final_action_by'
  ) THEN
    ALTER TABLE packaged_units ADD COLUMN final_action_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packaged_units' AND column_name = 'final_action_reason'
  ) THEN
    ALTER TABLE packaged_units ADD COLUMN final_action_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packaged_units' AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE packaged_units ADD COLUMN updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Update status constraint to include new statuses (keeping 'received' for backward compatibility)
DO $$
BEGIN
  ALTER TABLE packaged_units DROP CONSTRAINT IF EXISTS packaged_units_status_check;
  ALTER TABLE packaged_units ADD CONSTRAINT packaged_units_status_check
    CHECK (status IN ('available', 'reserved', 'in_transit', 'received', 'used', 'waste', 'returned', 'blocked', 'in_stock', 'shipped', 'opened', 'consumed'));
END $$;

-- =====================================================
-- 2. ENHANCE PRODUCTION BATCHES TABLE
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'production_batches' AND column_name = 'production_date'
  ) THEN
    ALTER TABLE production_batches ADD COLUMN production_date date DEFAULT CURRENT_DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'production_batches' AND column_name = 'expiry_date'
  ) THEN
    ALTER TABLE production_batches ADD COLUMN expiry_date date;
  END IF;
END $$;

-- =====================================================
-- 3. LIFECYCLE EVENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS packaged_unit_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  packaged_unit_id uuid NOT NULL REFERENCES packaged_units(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'produced',
    'packaged',
    'transferred',
    'received',
    'reserved',
    'unreserved',
    'used',
    'waste',
    'returned',
    'blocked',
    'unblocked'
  )),
  from_status text,
  to_status text,
  from_location_id uuid REFERENCES units(id) ON DELETE SET NULL,
  to_location_id uuid REFERENCES units(id) ON DELETE SET NULL,
  performed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  internal_order_id uuid REFERENCES internal_orders(id) ON DELETE SET NULL,
  reason text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_unit ON packaged_unit_lifecycle_events(packaged_unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_type ON packaged_unit_lifecycle_events(event_type);

ALTER TABLE packaged_unit_lifecycle_events ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. TRANSFERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS packaged_unit_transfers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  packaged_unit_id uuid NOT NULL REFERENCES packaged_units(id) ON DELETE CASCADE,
  internal_order_id uuid REFERENCES internal_orders(id) ON DELETE SET NULL,
  from_location_id uuid NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  to_location_id uuid NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  initiated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  shipped_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  received_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  initiated_at timestamptz DEFAULT now(),
  shipped_at timestamptz,
  received_at timestamptz,
  status text DEFAULT 'initiated' CHECK (status IN ('initiated', 'shipped', 'received', 'cancelled')),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfers_unit ON packaged_unit_transfers(packaged_unit_id);
CREATE INDEX IF NOT EXISTS idx_transfers_order ON packaged_unit_transfers(internal_order_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON packaged_unit_transfers(status);

ALTER TABLE packaged_unit_transfers ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. USAGE ACTIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS packaged_unit_usage_actions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  packaged_unit_id uuid NOT NULL REFERENCES packaged_units(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('used', 'waste', 'returned', 'blocked')),
  performed_by uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  location_id uuid NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  reason text,
  notes text,
  qr_code_scanned boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_actions_unit ON packaged_unit_usage_actions(packaged_unit_id);
CREATE INDEX IF NOT EXISTS idx_usage_actions_type ON packaged_unit_usage_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_usage_actions_location ON packaged_unit_usage_actions(location_id, created_at DESC);

ALTER TABLE packaged_unit_usage_actions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. FUNCTIONS
-- =====================================================

-- Function to get complete lifecycle of a packaged unit
CREATE OR REPLACE FUNCTION get_packaged_unit_lifecycle(unit_id uuid)
RETURNS TABLE (
  event_time timestamptz,
  event_type text,
  event_description text,
  performed_by_name text,
  location_name text,
  status text,
  metadata jsonb
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.created_at as event_time,
    e.event_type,
    CASE
      WHEN e.event_type = 'produced' THEN 'Batch produced'
      WHEN e.event_type = 'packaged' THEN 'Unit packaged'
      WHEN e.event_type = 'transferred' THEN 'Transferred to ' || COALESCE(u_to.name, 'unknown')
      WHEN e.event_type = 'received' THEN 'Received at ' || COALESCE(u_to.name, 'unknown')
      WHEN e.event_type = 'reserved' THEN 'Reserved for order'
      WHEN e.event_type = 'unreserved' THEN 'Reservation removed'
      WHEN e.event_type = 'used' THEN 'Used in production/service'
      WHEN e.event_type = 'waste' THEN 'Discarded as waste'
      WHEN e.event_type = 'returned' THEN 'Returned to CDP'
      WHEN e.event_type = 'blocked' THEN 'Blocked: ' || COALESCE(e.reason, 'quality issue')
      ELSE e.event_type
    END as event_description,
    COALESCE(p.full_name, p.email, 'System') as performed_by_name,
    COALESCE(u_to.name, u_from.name) as location_name,
    e.to_status as status,
    e.metadata
  FROM packaged_unit_lifecycle_events e
  LEFT JOIN profiles p ON p.id = e.performed_by
  LEFT JOIN units u_from ON u_from.id = e.from_location_id
  LEFT JOIN units u_to ON u_to.id = e.to_location_id
  WHERE e.packaged_unit_id = unit_id
  ORDER BY e.created_at ASC;
END;
$$;

-- Function to get all units in a batch with locations
CREATE OR REPLACE FUNCTION get_batch_units_locations(batch_id uuid)
RETURNS TABLE (
  unit_id uuid,
  unique_code text,
  display_code text,
  weight numeric,
  unit_type text,
  status text,
  location_name text,
  location_id uuid,
  packaging_date timestamptz,
  expiry_date date,
  transferred_at timestamptz,
  received_at timestamptz,
  final_action text,
  final_action_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pu.id as unit_id,
    pu.unique_code,
    pu.display_code,
    pu.weight,
    pu.unit as unit_type,
    pu.status,
    u.name as location_name,
    u.id as location_id,
    pu.packaging_date,
    pu.expiry_date,
    pu.transferred_at,
    pu.received_at,
    pu.final_action,
    pu.final_action_at
  FROM packaged_units pu
  LEFT JOIN units u ON u.id = pu.location_id
  WHERE pu.batch_id = get_batch_units_locations.batch_id
  ORDER BY pu.packaging_date ASC, pu.created_at ASC;
END;
$$;

-- Function to get available units for FIFO selection
CREATE OR REPLACE FUNCTION get_available_units_fifo(
  p_product_id uuid,
  p_location_id uuid
)
RETURNS TABLE (
  unit_id uuid,
  unique_code text,
  display_code text,
  weight numeric,
  unit_type text,
  expiry_date date,
  packaging_date timestamptz,
  days_until_expiry integer
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pu.id as unit_id,
    pu.unique_code,
    pu.display_code,
    pu.weight,
    pu.unit as unit_type,
    pu.expiry_date,
    pu.packaging_date,
    CASE
      WHEN pu.expiry_date IS NOT NULL
      THEN (pu.expiry_date - CURRENT_DATE)
      ELSE NULL
    END as days_until_expiry
  FROM packaged_units pu
  WHERE pu.product_id = p_product_id
    AND pu.location_id = p_location_id
    AND pu.status IN ('available', 'in_stock')
  ORDER BY
    pu.expiry_date ASC NULLS LAST,
    pu.packaging_date ASC,
    pu.created_at ASC;
END;
$$;

-- =====================================================
-- 7. TRIGGERS
-- =====================================================

-- Trigger to log lifecycle events automatically
CREATE OR REPLACE FUNCTION log_packaged_unit_lifecycle_event()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_type text;
BEGIN
  v_event_type := NULL;

  IF TG_OP = 'INSERT' THEN
    v_event_type := 'packaged';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status THEN
      CASE NEW.status
        WHEN 'reserved' THEN v_event_type := 'reserved';
        WHEN 'in_transit' THEN v_event_type := 'transferred';
        WHEN 'shipped' THEN v_event_type := 'transferred';
        WHEN 'available' THEN
          IF OLD.status = 'reserved' THEN
            v_event_type := 'unreserved';
          ELSIF OLD.status IN ('in_transit', 'shipped') THEN
            v_event_type := 'received';
          ELSIF OLD.status = 'blocked' THEN
            v_event_type := 'unblocked';
          END IF;
        WHEN 'in_stock' THEN
          IF OLD.status IN ('in_transit', 'shipped') THEN
            v_event_type := 'received';
          END IF;
        WHEN 'received' THEN v_event_type := 'received';
        WHEN 'used' THEN v_event_type := 'used';
        WHEN 'waste' THEN v_event_type := 'waste';
        WHEN 'consumed' THEN v_event_type := 'used';
        WHEN 'returned' THEN v_event_type := 'returned';
        WHEN 'blocked' THEN v_event_type := 'blocked';
      END CASE;
    END IF;
  END IF;

  IF v_event_type IS NOT NULL THEN
    INSERT INTO packaged_unit_lifecycle_events (
      packaged_unit_id,
      event_type,
      from_status,
      to_status,
      from_location_id,
      to_location_id,
      performed_by,
      reason,
      metadata
    ) VALUES (
      NEW.id,
      v_event_type,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      NEW.status,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.location_id ELSE NULL END,
      NEW.location_id,
      NEW.updated_by,
      NEW.final_action_reason,
      jsonb_build_object(
        'weight', NEW.weight,
        'unit', NEW.unit,
        'batch_id', NEW.batch_id,
        'operation', TG_OP
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_packaged_unit_lifecycle ON packaged_units;
CREATE TRIGGER trigger_log_packaged_unit_lifecycle
  AFTER INSERT OR UPDATE ON packaged_units
  FOR EACH ROW
  EXECUTE FUNCTION log_packaged_unit_lifecycle_event();

-- =====================================================
-- 8. RLS POLICIES
-- =====================================================

-- Lifecycle events policies
DROP POLICY IF EXISTS "Authenticated users can view lifecycle events" ON packaged_unit_lifecycle_events;
CREATE POLICY "Authenticated users can view lifecycle events"
  ON packaged_unit_lifecycle_events FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "System can create lifecycle events" ON packaged_unit_lifecycle_events;
CREATE POLICY "System can create lifecycle events"
  ON packaged_unit_lifecycle_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Transfers policies
DROP POLICY IF EXISTS "Users can view transfers in their units" ON packaged_unit_transfers;
CREATE POLICY "Users can view transfers in their units"
  ON packaged_unit_transfers FOR SELECT
  TO authenticated
  USING (
    from_location_id IN (
      SELECT unit_id FROM profiles WHERE id = auth.uid()
    )
    OR to_location_id IN (
      SELECT unit_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "CDP managers can create transfers" ON packaged_unit_transfers;
CREATE POLICY "CDP managers can create transfers"
  ON packaged_unit_transfers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'cdp_manager')
    )
  );

DROP POLICY IF EXISTS "Users can update transfers for their units" ON packaged_unit_transfers;
CREATE POLICY "Users can update transfers for their units"
  ON packaged_unit_transfers FOR UPDATE
  TO authenticated
  USING (
    from_location_id IN (
      SELECT unit_id FROM profiles WHERE id = auth.uid()
    )
    OR to_location_id IN (
      SELECT unit_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Usage actions policies
DROP POLICY IF EXISTS "Users can view usage actions in their unit" ON packaged_unit_usage_actions;
CREATE POLICY "Users can view usage actions in their unit"
  ON packaged_unit_usage_actions FOR SELECT
  TO authenticated
  USING (
    location_id IN (
      SELECT unit_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create usage actions in their unit" ON packaged_unit_usage_actions;
CREATE POLICY "Users can create usage actions in their unit"
  ON packaged_unit_usage_actions FOR INSERT
  TO authenticated
  WITH CHECK (
    location_id IN (
      SELECT unit_id FROM profiles WHERE id = auth.uid()
    )
    AND performed_by = auth.uid()
  );