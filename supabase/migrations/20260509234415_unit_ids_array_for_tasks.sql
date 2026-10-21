/*
  # Multi-unit support for HACCP tasks and mandatory task categories

  ## Changes
  1. haccp_tasks — add unit_ids (uuid[]) to allow multiple units; migrate existing unit_id
  2. mandatory_task_categories — add unit_ids (uuid[]) to allow multiple units; migrate existing unit_id
  3. mandatory_tasks — add unit_ids (uuid[]) so individual sub-tasks can be restricted to specific units

  ## Notes
  - unit_ids = NULL or '{}' means "all units" (existing behaviour)
  - unit_ids with values means "only these units"
  - Old unit_id columns are kept temporarily so existing queries don't break, then dropped
*/

-- haccp_tasks: add unit_ids, migrate, drop old
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'haccp_tasks' AND column_name = 'unit_ids'
  ) THEN
    ALTER TABLE public.haccp_tasks ADD COLUMN unit_ids uuid[] DEFAULT '{}';
  END IF;
END $$;

-- migrate existing unit_id into unit_ids array (if not null)
UPDATE public.haccp_tasks
SET unit_ids = ARRAY[unit_id]
WHERE unit_id IS NOT NULL AND (unit_ids IS NULL OR unit_ids = '{}');

-- mandatory_task_categories: add unit_ids, migrate, drop old
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mandatory_task_categories' AND column_name = 'unit_ids'
  ) THEN
    ALTER TABLE public.mandatory_task_categories ADD COLUMN unit_ids uuid[] DEFAULT '{}';
  END IF;
END $$;

UPDATE public.mandatory_task_categories
SET unit_ids = ARRAY[unit_id]
WHERE unit_id IS NOT NULL AND (unit_ids IS NULL OR unit_ids = '{}');

-- mandatory_tasks: add unit_ids for per-subtask unit restriction
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mandatory_tasks' AND column_name = 'unit_ids'
  ) THEN
    ALTER TABLE public.mandatory_tasks ADD COLUMN unit_ids uuid[] DEFAULT '{}';
  END IF;
END $$;
