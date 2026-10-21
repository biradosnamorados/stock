/*
  # Add QR Code to Packaged Units

  1. Changes
    - Add `qr_code` column to `packaged_units` table to store QR code data URL

  2. Notes
    - QR code is stored as base64 data URL for easy display
    - This enables direct printing and display of QR codes without regeneration
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packaged_units' AND column_name = 'qr_code'
  ) THEN
    ALTER TABLE packaged_units ADD COLUMN qr_code text;
  END IF;
END $$;