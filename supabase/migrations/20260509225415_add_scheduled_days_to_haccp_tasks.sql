/*
  # Adicionar dias específicos às tarefas HACCP

  ## Alterações
  - Tabela `haccp_tasks`:
    - Nova coluna `scheduled_days` (integer[], nullable) — array de dias da semana (0=Dom, 1=Seg, ..., 6=Sáb)
    - Novo valor de frequência `specific_days` suportado via constraint check atualizado

  ## Notas
  - `scheduled_days` só é relevante quando `frequency = 'specific_days'`
  - Tarefas com `frequency = 'specific_days'` e `scheduled_days = NULL` são tratadas como inativas
  - Os outros valores de frequência não são afetados
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'haccp_tasks' AND column_name = 'scheduled_days'
  ) THEN
    ALTER TABLE haccp_tasks ADD COLUMN scheduled_days integer[];
  END IF;
END $$;
