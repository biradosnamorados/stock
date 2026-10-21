import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Save, Mail, AlertCircle, CheckCircle } from 'lucide-react';

interface Unit {
  id: string;
  name: string;
  code: string;
}

interface SMTPSettings {
  id?: string;
  unit_id: string;
  smtp_provider: 'resend' | 'sendgrid' | 'smtp' | 'ses';
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  api_key: string;
  from_email: string;
  from_name: string;
  reply_to: string;
  enabled: boolean;
  test_mode: boolean;
}

export default function SMTPSettings() {
  const { profile } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [settings, setSettings] = useState<SMTPSettings>({
    unit_id: '',
    smtp_provider: 'resend',
    smtp_host: '',
    smtp_port: 587,
    smtp_username: '',
    smtp_password: '',
    api_key: '',
    from_email: '',
    from_name: '',
    reply_to: '',
    enabled: false,
    test_mode: false,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadUnits();
  }, []);

  useEffect(() => {
    if (selectedUnitId) {
      loadSettings(selectedUnitId);
    }
  }, [selectedUnitId]);

  async function loadUnits() {
    try {
      const { data, error } = await supabase
        .from('units')
        .select('id, name, code')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setUnits(data || []);

      if (data && data.length > 0 && !selectedUnitId) {
        setSelectedUnitId(data[0].id);
      }
    } catch (error) {
      console.error('Error loading units:', error);
    }
  }

  async function loadSettings(unitId: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('unit_smtp_settings')
        .select('*')
        .eq('unit_id', unitId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data);
      } else {
        setSettings({
          unit_id: unitId,
          smtp_provider: 'resend',
          smtp_host: '',
          smtp_port: 587,
          smtp_username: '',
          smtp_password: '',
          api_key: '',
          from_email: '',
          from_name: '',
          reply_to: '',
          enabled: false,
          test_mode: false,
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      setMessage({ type: 'error', text: 'Erro ao carregar configurações' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!settings.from_email || !settings.from_name) {
      setMessage({ type: 'error', text: 'Email e nome de envio são obrigatórios' });
      return;
    }

    if (settings.smtp_provider === 'resend' || settings.smtp_provider === 'sendgrid') {
      if (!settings.api_key) {
        setMessage({ type: 'error', text: 'API Key é obrigatória para este provider' });
        return;
      }
    } else if (settings.smtp_provider === 'smtp') {
      if (!settings.smtp_host || !settings.smtp_username || !settings.smtp_password) {
        setMessage({ type: 'error', text: 'Configurações SMTP incompletas' });
        return;
      }
    }

    setSaving(true);
    setMessage(null);

    try {
      if (settings.id) {
        const { error } = await supabase
          .from('unit_smtp_settings')
          .update({
            smtp_provider: settings.smtp_provider,
            smtp_host: settings.smtp_host,
            smtp_port: settings.smtp_port,
            smtp_username: settings.smtp_username,
            smtp_password: settings.smtp_password,
            api_key: settings.api_key,
            from_email: settings.from_email,
            from_name: settings.from_name,
            reply_to: settings.reply_to,
            enabled: settings.enabled,
            test_mode: settings.test_mode,
            updated_at: new Date().toISOString(),
          })
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('unit_smtp_settings')
          .insert({
            unit_id: selectedUnitId,
            smtp_provider: settings.smtp_provider,
            smtp_host: settings.smtp_host,
            smtp_port: settings.smtp_port,
            smtp_username: settings.smtp_username,
            smtp_password: settings.smtp_password,
            api_key: settings.api_key,
            from_email: settings.from_email,
            from_name: settings.from_name,
            reply_to: settings.reply_to,
            enabled: settings.enabled,
            test_mode: settings.test_mode,
          });

        if (error) throw error;
      }

      setMessage({ type: 'success', text: 'Configurações guardadas com sucesso' });
      await loadSettings(selectedUnitId);
    } catch (error: any) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: error.message || 'Erro ao guardar configurações' });
    } finally {
      setSaving(false);
    }
  }

  if (profile?.role !== 'Admin') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Apenas administradores podem aceder a esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Mail className="w-7 h-7" />
          Configurações de Email (SMTP)
        </h1>
        <p className="text-gray-600 mt-1">
          Configure as definições de envio de emails por unidade
        </p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
          message.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          )}
          <p className={message.type === 'success' ? 'text-green-800' : 'text-red-800'}>
            {message.text}
          </p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Selecionar Unidade
          </label>
          <select
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.code})
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Provider de Email
                </label>
                <select
                  value={settings.smtp_provider}
                  onChange={(e) => setSettings({ ...settings, smtp_provider: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="resend">Resend</option>
                  <option value="sendgrid">SendGrid</option>
                  <option value="smtp">SMTP Personalizado</option>
                  <option value="ses">Amazon SES</option>
                </select>
              </div>

              {(settings.smtp_provider === 'resend' || settings.smtp_provider === 'sendgrid' || settings.smtp_provider === 'ses') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    API Key *
                  </label>
                  <input
                    type="password"
                    value={settings.api_key}
                    onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Insira a API Key"
                  />
                </div>
              )}

              {settings.smtp_provider === 'smtp' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        SMTP Host *
                      </label>
                      <input
                        type="text"
                        value={settings.smtp_host}
                        onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="smtp.exemplo.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        SMTP Port *
                      </label>
                      <input
                        type="number"
                        value={settings.smtp_port}
                        onChange={(e) => setSettings({ ...settings, smtp_port: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="587"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Username *
                    </label>
                    <input
                      type="text"
                      value={settings.smtp_username}
                      onChange={(e) => setSettings({ ...settings, smtp_username: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Password *
                    </label>
                    <input
                      type="password"
                      value={settings.smtp_password}
                      onChange={(e) => setSettings({ ...settings, smtp_password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email de Envio *
                  </label>
                  <input
                    type="email"
                    value={settings.from_email}
                    onChange={(e) => setSettings({ ...settings, from_email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="encomendas@empresa.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome de Envio *
                  </label>
                  <input
                    type="text"
                    value={settings.from_name}
                    onChange={(e) => setSettings({ ...settings, from_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Encomendas"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reply-To (opcional)
                </label>
                <input
                  type="email"
                  value={settings.reply_to}
                  onChange={(e) => setSettings({ ...settings, reply_to: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="responder@empresa.com"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Ativar configuração</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.test_mode}
                    onChange={(e) => setSettings({ ...settings, test_mode: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Modo de teste</span>
                </label>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    A guardar...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Guardar Configurações
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">Informação</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• As configurações são específicas de cada unidade</li>
          <li>• Se não configurar SMTP para uma unidade, será usado o sistema global</li>
          <li>• As API Keys e passwords são guardadas de forma segura</li>
          <li>• Apenas administradores podem gerir estas configurações</li>
        </ul>
      </div>
    </div>
  );
}
