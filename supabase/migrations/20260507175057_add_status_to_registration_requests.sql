/*
  # Add status column to registration_requests

  Instead of deriving the request status from a join with profiles (which is
  fragile due to RLS), store the status directly on the request row.

  Changes:
  - New column: status (text) with default 'pending'
  - Backfill existing rows based on profiles.account_status
  - Index on status for fast filtering
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'registration_requests' AND column_name = 'status'
  ) THEN
    ALTER TABLE registration_requests ADD COLUMN status text NOT NULL DEFAULT 'pending';
  END IF;
END $$;

-- Backfill from profiles
UPDATE registration_requests rr
SET status = CASE
  WHEN p.account_status = 'active' THEN 'approved'
  WHEN p.account_status = 'rejected' THEN 'rejected'
  ELSE 'pending'
END
FROM profiles p
WHERE p.id = rr.profile_id;

CREATE INDEX IF NOT EXISTS idx_registration_requests_status ON registration_requests(status);
