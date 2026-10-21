/*
  # Adicionar role à tabela access_profiles

  ## Resumo
  Unifica "Função" e "Perfil de Acesso" num único conceito. Cada perfil de
  acesso passa a ter um role associado (Admin, Chefe, Staff) que é copiado
  para profiles.role quando o perfil é atribuído ao utilizador.

  ## Alterações
  - access_profiles: nova coluna `role` (text, NOT NULL, DEFAULT 'Staff')
    com constraint CHECK ('Admin', 'Chefe', 'Staff')
  - Perfis existentes ficam com role = 'Staff' por defeito (pode ser
    corrigido manualmente pelo Admin na UI)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'access_profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE access_profiles
      ADD COLUMN role text NOT NULL DEFAULT 'Staff'
      CHECK (role IN ('Admin', 'Chefe', 'Staff'));
  END IF;
END $$;
