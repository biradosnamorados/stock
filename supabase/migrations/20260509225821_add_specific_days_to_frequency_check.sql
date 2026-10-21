/*
  # Atualizar constraint de frequência em haccp_tasks

  Adiciona 'specific_days' aos valores permitidos no campo frequency.
*/

ALTER TABLE haccp_tasks DROP CONSTRAINT haccp_tasks_frequency_check;

ALTER TABLE haccp_tasks ADD CONSTRAINT haccp_tasks_frequency_check
  CHECK (frequency = ANY (ARRAY['daily', 'per_shift', 'weekly', 'monthly', 'manual', 'specific_days']));
