export type HaccpFrequency = 'daily' | 'per_shift' | 'weekly' | 'monthly' | 'manual' | 'specific_days';
export type HaccpInputType = 'checkbox' | 'numeric' | 'text' | 'photo' | 'datetime';
export type HaccpFieldStatus = 'compliant' | 'non_compliant' | 'not_used';
export type HaccpSessionStatus = 'pending' | 'in_progress' | 'completed' | 'incomplete' | 'non_compliant';

export interface HaccpTaskInput {
  id: string;
  task_id: string;
  label: string;
  input_type: HaccpInputType;
  required: boolean;
  numeric_min: number | null;
  numeric_max: number | null;
  placeholder: string | null;
  display_order: number;
  created_at: string;
}

export interface HaccpTask {
  id: string;
  name: string;
  description: string | null;
  department_id: string | null;
  unit_id: string | null;
  unit_ids: string[] | null;
  frequency: HaccpFrequency;
  scheduled_days: number[] | null;
  active: boolean;
  display_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  departments?: { id: string; name: string } | null;
  units?: { id: string; name: string } | null;
  haccp_task_inputs?: HaccpTaskInput[];
}

export interface HaccpTaskSession {
  id: string;
  task_id: string;
  unit_id: string | null;
  department_id: string | null;
  session_date: string;
  shift_period: string | null;
  status: HaccpSessionStatus;
  total_fields: number;
  filled_fields: number;
  completed_at: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HaccpFieldEntry {
  id: string;
  session_id: string;
  task_id: string;
  input_id: string | null;
  input_label: string;
  input_type: HaccpInputType;
  field_status: HaccpFieldStatus;
  value_boolean: boolean | null;
  value_numeric: number | null;
  value_text: string | null;
  value_photo_url: string | null;
  value_datetime: string | null;
  observation: string | null;
  performed_by: string;
  performed_at: string;
  created_at: string;
  profiles?: { full_name: string | null; email: string } | null;
}

// Legacy — kept for history view compatibility
export interface HaccpTaskLogValue {
  id: string;
  log_id: string;
  input_id: string | null;
  input_label: string;
  input_type: HaccpInputType;
  value_text: string | null;
  value_numeric: number | null;
  value_boolean: boolean | null;
  value_photo_url: string | null;
  value_datetime: string | null;
}

export interface HaccpTaskLog {
  id: string;
  task_id: string;
  task_name: string;
  performed_by: string;
  unit_id: string | null;
  department_id: string | null;
  completed_at: string;
  notes: string | null;
  created_at: string;
  profiles?: { full_name: string | null; email: string } | null;
  units?: { name: string } | null;
  departments?: { name: string } | null;
  haccp_tasks?: { name: string; frequency: HaccpFrequency } | null;
  haccp_task_log_values?: HaccpTaskLogValue[];
}

export const FREQUENCY_LABELS: Record<HaccpFrequency, string> = {
  daily: 'Diária',
  per_shift: 'Por Turno',
  weekly: 'Semanal',
  monthly: 'Mensal',
  manual: 'Manual',
  specific_days: 'Dias específicos',
};

export const SESSION_STATUS_LABELS: Record<HaccpSessionStatus, string> = {
  pending: 'Pendente',
  in_progress: 'Em curso',
  completed: 'Concluído',
  incomplete: 'Incompleto',
  non_compliant: 'Não conforme',
};

export const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const DAY_LABELS_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const INPUT_TYPE_LABELS: Record<HaccpInputType, string> = {
  checkbox: 'Sim/Não',
  numeric: 'Numérico',
  text: 'Texto',
  photo: 'Fotografia',
  datetime: 'Data/Hora',
};

export type InputValues = Record<string, string | number | boolean | null>;
