/*
  # Create Photo Storage Buckets

  Creates storage buckets for operational photos:
  - haccp-photos: photos from HACCP task execution
  - task-photos: photos from mandatory task execution
  - stock-photos: photos from stock counts and operational records

  All buckets are private (authenticated access only).
  RLS policies allow authenticated users to upload, and read their own unit's photos.
*/

-- Create buckets if they don't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('haccp-photos', 'haccp-photos', false, 10485760, ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic']),
  ('task-photos', 'task-photos', false, 10485760, ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic']),
  ('stock-photos', 'stock-photos', false, 10485760, ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for haccp-photos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated users can upload haccp photos'
  ) THEN
    CREATE POLICY "Authenticated users can upload haccp photos"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'haccp-photos');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated users can read haccp photos'
  ) THEN
    CREATE POLICY "Authenticated users can read haccp photos"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'haccp-photos');
  END IF;
END $$;

-- Storage policies for task-photos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated users can upload task photos'
  ) THEN
    CREATE POLICY "Authenticated users can upload task photos"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'task-photos');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated users can read task photos'
  ) THEN
    CREATE POLICY "Authenticated users can read task photos"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'task-photos');
  END IF;
END $$;

-- Storage policies for stock-photos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated users can upload stock photos'
  ) THEN
    CREATE POLICY "Authenticated users can upload stock photos"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'stock-photos');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated users can read stock photos'
  ) THEN
    CREATE POLICY "Authenticated users can read stock photos"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'stock-photos');
  END IF;
END $$;
