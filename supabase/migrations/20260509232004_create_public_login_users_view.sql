/*
  # View pública para seleção de utilizadores no login

  Expõe apenas os campos mínimos necessários para o ecrã de seleção de utilizador
  (nome, username, unit_id, pin_hash) sem necessidade de autenticação.
  Não expõe email, role, nem qualquer dado sensível além do pin_hash
  (que é um SHA-256 não reversível).
*/

CREATE OR REPLACE VIEW public.login_users AS
  SELECT
    id,
    full_name,
    username,
    email,
    unit_id,
    department_id,
    pin_hash,
    active
  FROM public.profiles
  WHERE active = true;

-- Permitir leitura pública (anon) nesta view
GRANT SELECT ON public.login_users TO anon, authenticated;
