-- Add SMTP Configuration Per Unit
--
-- Overview:
-- This migration adds support for SMTP email configuration per unit, allowing each
-- location to have its own email settings for sending purchase orders.
--
-- New Tables:
-- - unit_smtp_settings: Stores SMTP/email service configuration per unit
--
-- Security:
-- - RLS enabled with admin-only access
-- - Passwords and API keys stored (should be encrypted at app level)

-- Create unit_smtp_settings table
CREATE TABLE IF NOT EXISTS unit_smtp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid REFERENCES units(id) ON DELETE CASCADE UNIQUE NOT NULL,
  smtp_provider text NOT NULL CHECK (smtp_provider IN ('resend', 'sendgrid', 'smtp', 'ses')),
  smtp_host text,
  smtp_port integer,
  smtp_username text,
  smtp_password text,
  api_key text,
  from_email text NOT NULL,
  from_name text NOT NULL,
  reply_to text,
  enabled boolean DEFAULT false,
  test_mode boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE unit_smtp_settings ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_unit_smtp_settings_unit ON unit_smtp_settings(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_smtp_settings_enabled ON unit_smtp_settings(enabled);

-- RLS Policies

-- Admins can view all SMTP settings
CREATE POLICY "Admins can view all SMTP settings"
  ON unit_smtp_settings FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- Unit managers can view their own unit SMTP settings
CREATE POLICY "Unit managers can view own unit SMTP settings"
  ON unit_smtp_settings FOR SELECT
  TO authenticated
  USING (
    unit_id IN (
      SELECT unit_id FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('cdp_manager', 'restaurant_manager')
    )
  );

-- Admins can insert SMTP settings
CREATE POLICY "Admins can insert SMTP settings"
  ON unit_smtp_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- Admins can update SMTP settings
CREATE POLICY "Admins can update SMTP settings"
  ON unit_smtp_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- Admins can delete SMTP settings
CREATE POLICY "Admins can delete SMTP settings"
  ON unit_smtp_settings FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
