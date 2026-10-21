/*
  # Add geolocation columns to mandatory_task_logs

  Adds latitude, longitude, and location_accuracy columns to store the GPS
  coordinates captured when a task is completed. All columns are nullable
  so the completion is never blocked if the user denies location access.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mandatory_task_logs' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE mandatory_task_logs ADD COLUMN latitude double precision;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mandatory_task_logs' AND column_name = 'longitude'
  ) THEN
    ALTER TABLE mandatory_task_logs ADD COLUMN longitude double precision;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mandatory_task_logs' AND column_name = 'location_accuracy'
  ) THEN
    ALTER TABLE mandatory_task_logs ADD COLUMN location_accuracy double precision;
  END IF;
END $$;
