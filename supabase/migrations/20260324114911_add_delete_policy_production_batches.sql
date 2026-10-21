/*
  # Add DELETE policy for production_batches

  1. Changes
    - Add DELETE policy for production_batches table
    - Allow Admin, Chefe, and Staff roles to delete production batches
  
  2. Security
    - Only authenticated users with appropriate roles can delete
    - Maintains data integrity through role-based access control
*/

-- Add DELETE policy for production_batches
CREATE POLICY "CDP staff can delete batches"
  ON production_batches
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('Admin', 'Chefe', 'Staff')
    )
  );
