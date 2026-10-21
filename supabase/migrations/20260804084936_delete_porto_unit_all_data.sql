/*
# Delete BN Porto unit and all related data

1. Purpose
   The Porto restaurant unit (BN Porto, code PRT) has permanently closed.
   This migration removes ALL data associated with this unit across every table
   in the database, including user accounts, orders, HACCP records, mandatory
   task logs, supplier links, and the unit record itself.

2. Unit being deleted
   - units.id = '75a24094-186d-43f9-99c6-f7332307f8a4' (BN Porto, code PRT)

3. Data being deleted (in dependency order)
   - haccp_field_entries (via sessions for Porto unit_id + sessions for tasks with Porto in unit_ids)
   - haccp_task_sessions (unit_id = Porto)
   - haccp_tasks (unit_id = Porto) — for tasks with Porto in unit_ids array, remove Porto from array instead of deleting
   - internal_order_lines (via internal_orders to_unit_id = Porto)
   - internal_orders (to_unit_id = Porto)
   - mandatory_task_logs (unit_id = Porto)
   - registration_requests (unit_id = Porto)
   - auth.users (9 accounts) — cascades to profiles via FK
   - supplier_units (unit_id = Porto) — CASCADE on FK
   - unit_smtp_settings (unit_id = Porto) — CASCADE on FK
   - units (the BN Porto record itself)

4. Notes
   - HACCP tasks that have Porto in their unit_ids array alongside other units
     will have Porto REMOVED from the array, preserving the task for other units.
   - HACCP tasks where Porto is the ONLY unit in unit_ids will be deleted entirely
     along with their sessions and field entries.
   - auth.users deletion cascades to profiles (FK constraint).
   - supplier_units and unit_smtp_settings have CASCADE FKs, so deleting the unit
     will automatically remove these, but they are also handled explicitly for clarity.
   - This operation is IRREVERSIBLE.
*/

DO $$
DECLARE
    v_porto_id uuid := '75a24094-186d-43f9-99c6-f7332307f8a4';
    v_session_ids uuid[];
    v_task_ids uuid[];
    v_order_ids uuid[];
    v_auth_user_ids uuid[];
BEGIN
    -- ── 1. HACCP field entries ──────────────────────────────────────
    -- Field entries for sessions directly linked to Porto via unit_id
    SELECT array_agg(hts.id) INTO v_session_ids
    FROM haccp_task_sessions hts WHERE hts.unit_id = v_porto_id;

    IF v_session_ids IS NOT NULL THEN
        DELETE FROM haccp_field_entries WHERE session_id = ANY(v_session_ids);
    END IF;

    -- Field entries for sessions linked to tasks that have Porto in unit_ids
    SELECT array_agg(hts.id) INTO v_session_ids
    FROM haccp_task_sessions hts
    JOIN haccp_tasks ht ON hts.task_id = ht.id
    WHERE v_porto_id = ANY(ht.unit_ids);

    IF v_session_ids IS NOT NULL THEN
        DELETE FROM haccp_field_entries WHERE session_id = ANY(v_session_ids);
    END IF;

    -- ── 2. HACCP task sessions ─────────────────────────────────────
    -- Sessions for tasks with Porto in unit_ids
    SELECT array_agg(ht.id) INTO v_task_ids
    FROM haccp_tasks ht WHERE v_porto_id = ANY(ht.unit_ids);

    IF v_task_ids IS NOT NULL THEN
        DELETE FROM haccp_task_sessions WHERE task_id = ANY(v_task_ids);
    END IF;

    -- Sessions directly linked to Porto via unit_id
    DELETE FROM haccp_task_sessions WHERE unit_id = v_porto_id;

    -- ── 3. HACCP tasks ─────────────────────────────────────────────
    -- For tasks with Porto in unit_ids array:
    --   - If Porto is the ONLY unit, delete the task
    --   - If other units remain, remove Porto from the array
    IF v_task_ids IS NOT NULL THEN
        -- Delete tasks where Porto is the only unit
        DELETE FROM haccp_tasks
        WHERE id = ANY(v_task_ids) AND array_length(unit_ids, 1) = 1;

        -- Remove Porto from unit_ids array for remaining tasks
        UPDATE haccp_tasks
        SET unit_ids = array_remove(unit_ids, v_porto_id)
        WHERE id = ANY(v_task_ids) AND array_length(unit_ids, 1) > 1;
    END IF;

    -- Delete tasks directly linked to Porto via unit_id (scalar column)
    DELETE FROM haccp_tasks WHERE unit_id = v_porto_id;

    -- ── 4. Internal orders ─────────────────────────────────────────
    SELECT array_agg(io.id) INTO v_order_ids
    FROM internal_orders io WHERE io.to_unit_id = v_porto_id;

    IF v_order_ids IS NOT NULL THEN
        DELETE FROM internal_order_lines WHERE order_id = ANY(v_order_ids);
        DELETE FROM internal_order_packages WHERE order_id = ANY(v_order_ids);
        DELETE FROM internal_orders WHERE id = ANY(v_order_ids);
    END IF;

    -- ── 5. Mandatory task logs ─────────────────────────────────────
    DELETE FROM mandatory_task_logs WHERE unit_id = v_porto_id;

    -- ── 6. Registration requests ───────────────────────────────────
    DELETE FROM registration_requests WHERE unit_id = v_porto_id;

    -- ── 7. User accounts (auth.users → profiles cascade) ───────────
    SELECT array_agg(p.id) INTO v_auth_user_ids
    FROM profiles p WHERE p.unit_id = v_porto_id;

    IF v_auth_user_ids IS NOT NULL THEN
        -- Delete profiles first (to avoid FK issues), then auth.users
        DELETE FROM profiles WHERE id = ANY(v_auth_user_ids);
        DELETE FROM auth.users WHERE id = ANY(v_auth_user_ids);
    END IF;

    -- ── 8. Delete the unit itself ──────────────────────────────────
    -- supplier_units and unit_smtp_settings have CASCADE FKs,
    -- so they are removed automatically.
    DELETE FROM units WHERE id = v_porto_id;
END $$;
