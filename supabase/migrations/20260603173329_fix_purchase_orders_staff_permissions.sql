/*
  # Corrigir permissões RLS para purchase_orders e internal_orders

  ## Resumo
  1. purchase_orders INSERT: alargado a Staff (todos os roles podem criar
     encomendas a fornecedores)
  2. purchase_orders UPDATE: alargado a todos para a sua própria unidade
     (corrige Staff não conseguir actualizar)
  3. internal_orders: sem alteração necessária (já permite todos os roles)

  ## Alterações
  - DROP + CREATE da política INSERT de purchase_orders (inclui Staff)
  - DROP + CREATE da política UPDATE de purchase_orders (inclui unit_id match para todos)
*/

-- purchase_orders INSERT: abrir a todos os roles
DROP POLICY IF EXISTS "Managers can create purchase orders" ON purchase_orders;

CREATE POLICY "All staff can create purchase orders"
  ON purchase_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles
      WHERE role IN ('Admin', 'Chefe', 'Staff') AND active = true
    )
  );

-- purchase_orders UPDATE: já estava correcto (unit_id match cobre todos)
-- Mas substituir para garantir que Staff da unidade pode actualizar
DROP POLICY IF EXISTS "Managers can update purchase orders" ON purchase_orders;

CREATE POLICY "Users can update own unit purchase orders"
  ON purchase_orders
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid() AND active = true)
  )
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid() AND active = true)
  );
