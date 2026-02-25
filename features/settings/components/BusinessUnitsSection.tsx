import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Mail, MessageCircle, Plus, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { SettingsSection } from './SettingsSection';

interface BusinessUnit {
  id: string;
  code: string;
  name: string;
  cnpj: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ApiResponse {
  data?: BusinessUnit[];
  error?: string;
}

interface ChannelSettingsResponse {
  data?: {
    businessUnit: {
      id: string;
      code: string;
      name: string;
    };
    channels: {
      email: {
        isActive: boolean;
        config: Record<string, unknown>;
        updatedAt: string | null;
      };
      whatsapp: {
        isActive: boolean;
        config: Record<string, unknown>;
        updatedAt: string | null;
      };
    };
  };
  error?: string;
}

interface EmailConfigState {
  senderName: string;
  senderEmail: string;
  replyTo: string;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  smtpSecure: boolean;
}

interface WhatsappConfigState {
  provider: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  fromNumber: string;
  webhookUrl: string;
}

/**
 * Componente React `BusinessUnitsSection`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const BusinessUnitsSection: React.FC = () => {
  const { addToast } = useToast();

  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [selectedBusinessUnitId, setSelectedBusinessUnitId] = useState<string>('');

  const [channelsLoading, setChannelsLoading] = useState(false);
  const [emailActive, setEmailActive] = useState(false);
  const [whatsappActive, setWhatsappActive] = useState(false);
  const [savingChannel, setSavingChannel] = useState<'email' | 'whatsapp' | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');

  const [emailConfig, setEmailConfig] = useState<EmailConfigState>({
    senderName: '',
    senderEmail: '',
    replyTo: '',
    smtpHost: '',
    smtpPort: '587',
    smtpUsername: '',
    smtpPassword: '',
    smtpSecure: true,
  });

  const [whatsappConfig, setWhatsappConfig] = useState<WhatsappConfigState>({
    provider: '',
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    fromNumber: '',
    webhookUrl: '',
  });

  const canCreate = useMemo(() => {
    return code.trim().length >= 2 && name.trim().length >= 2;
  }, [code, name]);

  const selectedBusinessUnit = useMemo(
    () => businessUnits.find((bu) => bu.id === selectedBusinessUnitId) ?? null,
    [businessUnits, selectedBusinessUnitId]
  );

  const hydrateEmailConfig = (config: Record<string, unknown>) => {
    setEmailConfig({
      senderName: typeof config.senderName === 'string' ? config.senderName : '',
      senderEmail: typeof config.senderEmail === 'string' ? config.senderEmail : '',
      replyTo: typeof config.replyTo === 'string' ? config.replyTo : '',
      smtpHost: typeof config.smtpHost === 'string' ? config.smtpHost : '',
      smtpPort: typeof config.smtpPort === 'number' ? String(config.smtpPort) : '587',
      smtpUsername: typeof config.smtpUsername === 'string' ? config.smtpUsername : '',
      smtpPassword: typeof config.smtpPassword === 'string' ? config.smtpPassword : '',
      smtpSecure: typeof config.smtpSecure === 'boolean' ? config.smtpSecure : true,
    });
  };

  const hydrateWhatsappConfig = (config: Record<string, unknown>) => {
    setWhatsappConfig({
      provider: typeof config.provider === 'string' ? config.provider : '',
      phoneNumberId: typeof config.phoneNumberId === 'string' ? config.phoneNumberId : '',
      businessAccountId: typeof config.businessAccountId === 'string' ? config.businessAccountId : '',
      accessToken: typeof config.accessToken === 'string' ? config.accessToken : '',
      fromNumber: typeof config.fromNumber === 'string' ? config.fromNumber : '',
      webhookUrl: typeof config.webhookUrl === 'string' ? config.webhookUrl : '',
    });
  };

  const loadBusinessUnits = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/business-units', { method: 'GET' });
      const body = (await res.json().catch(() => ({}))) as ApiResponse;

      if (!res.ok) {
        throw new Error(body.error || 'Falha ao carregar unidades.');
      }

      setBusinessUnits(body.data ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar unidades.';
      addToast(message, 'error');
      setBusinessUnits([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') return;
    loadBusinessUnits();
  }, []);

  useEffect(() => {
    if (!selectedBusinessUnitId && businessUnits.length > 0) {
      setSelectedBusinessUnitId(businessUnits[0].id);
    }
  }, [businessUnits, selectedBusinessUnitId]);

  const loadChannelSettings = async (businessUnitId: string) => {
    setChannelsLoading(true);
    try {
      const res = await fetch(`/api/settings/business-units/${businessUnitId}/channels`, {
        method: 'GET',
      });
      const body = (await res.json().catch(() => ({}))) as ChannelSettingsResponse;

      if (!res.ok || !body.data) {
        throw new Error(body.error || 'Falha ao carregar configurações de canais.');
      }

      setEmailActive(Boolean(body.data.channels.email.isActive));
      setWhatsappActive(Boolean(body.data.channels.whatsapp.isActive));
      hydrateEmailConfig(body.data.channels.email.config || {});
      hydrateWhatsappConfig(body.data.channels.whatsapp.config || {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar configurações de canais.';
      addToast(message, 'error');
      setEmailActive(false);
      setWhatsappActive(false);
      hydrateEmailConfig({});
      hydrateWhatsappConfig({});
    } finally {
      setChannelsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedBusinessUnitId) return;
    if (process.env.NODE_ENV === 'test') return;
    loadChannelSettings(selectedBusinessUnitId);
  }, [selectedBusinessUnitId]);

  const handleCreate = async () => {
    if (!canCreate || creating) return;

    setCreating(true);
    try {
      const payload = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        cnpj: cnpj.trim() || null,
      };

      const res = await fetch('/api/settings/business-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => ({}))) as { data?: BusinessUnit; error?: string };

      if (!res.ok || !body.data) {
        throw new Error(body.error || 'Falha ao criar unidade.');
      }

      setBusinessUnits((prev) => {
        const next = [...prev, body.data as BusinessUnit];
        next.sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });

      setCode('');
      setName('');
      setCnpj('');
      addToast('Unidade criada com sucesso.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao criar unidade.';
      addToast(message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string) => {
    if (togglingId) return;

    setTogglingId(id);
    try {
      const res = await fetch(`/api/settings/business-units/${id}/toggle`, {
        method: 'POST',
      });

      const body = (await res.json().catch(() => ({}))) as { data?: BusinessUnit; error?: string };
      if (!res.ok || !body.data) {
        throw new Error(body.error || 'Falha ao atualizar unidade.');
      }

      setBusinessUnits((prev) => prev.map((bu) => (bu.id === id ? body.data as BusinessUnit : bu)));
      addToast('Status da unidade atualizado.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao atualizar unidade.';
      addToast(message, 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const saveEmailSettings = async () => {
    if (!selectedBusinessUnitId || savingChannel) return;

    setSavingChannel('email');
    try {
      const payload = {
        channel: 'email',
        isActive: emailActive,
        config: {
          senderName: emailConfig.senderName,
          senderEmail: emailConfig.senderEmail,
          replyTo: emailConfig.replyTo,
          smtpHost: emailConfig.smtpHost,
          smtpPort: emailConfig.smtpPort ? Number(emailConfig.smtpPort) : null,
          smtpUsername: emailConfig.smtpUsername,
          smtpPassword: emailConfig.smtpPassword,
          smtpSecure: emailConfig.smtpSecure,
        },
      };

      const res = await fetch(`/api/settings/business-units/${selectedBusinessUnitId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error || 'Falha ao salvar configurações de email.');
      }

      addToast('Configurações de email salvas.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao salvar configurações de email.';
      addToast(message, 'error');
    } finally {
      setSavingChannel(null);
    }
  };

  const saveWhatsappSettings = async () => {
    if (!selectedBusinessUnitId || savingChannel) return;

    setSavingChannel('whatsapp');
    try {
      const payload = {
        channel: 'whatsapp',
        isActive: whatsappActive,
        config: {
          provider: whatsappConfig.provider,
          phoneNumberId: whatsappConfig.phoneNumberId,
          businessAccountId: whatsappConfig.businessAccountId,
          accessToken: whatsappConfig.accessToken,
          fromNumber: whatsappConfig.fromNumber,
          webhookUrl: whatsappConfig.webhookUrl,
        },
      };

      const res = await fetch(`/api/settings/business-units/${selectedBusinessUnitId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error || 'Falha ao salvar configurações de WhatsApp.');
      }

      addToast('Configurações de WhatsApp salvas.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao salvar configurações de WhatsApp.';
      addToast(message, 'error');
    } finally {
      setSavingChannel(null);
    }
  };

  return (
    <SettingsSection title="Unidades (BUs)" icon={Building2}>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
        Cadastre e gerencie as unidades de negócio da organização para segmentação de contatos e canais.
      </p>

      <div className="p-4 rounded-xl border bg-slate-50 dark:bg-black/20 border-slate-200 dark:border-white/5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Código</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ex: MATRIZ"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Distribuidora São Paulo"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">CNPJ (opcional)</label>
            <input
              type="text"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              placeholder="00.000.000/0000-00"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!canCreate || creating}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" />
              Criar
            </button>
          </div>
        </div>
      </div>

      <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-slate-50 dark:bg-white/5 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
          <div className="col-span-2">Código</div>
          <div className="col-span-4">Nome</div>
          <div className="col-span-3">CNPJ</div>
          <div className="col-span-1 text-center">Status</div>
          <div className="col-span-2 text-right">Ação</div>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">Carregando unidades...</div>
        ) : businessUnits.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">Nenhuma unidade cadastrada.</div>
        ) : (
          businessUnits.map((bu) => (
            <div
              key={bu.id}
              className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-slate-200 dark:border-white/10 text-sm items-center"
            >
              <div className="col-span-2 font-semibold text-slate-900 dark:text-white">{bu.code}</div>
              <div className="col-span-4 text-slate-700 dark:text-slate-200">{bu.name}</div>
              <div className="col-span-3 text-slate-600 dark:text-slate-300">{bu.cnpj || '—'}</div>
              <div className="col-span-1 text-center">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    bu.is_active
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {bu.is_active ? 'Ativa' : 'Inativa'}
                </span>
              </div>
              <div className="col-span-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleToggle(bu.id)}
                  disabled={togglingId === bu.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50"
                >
                  {bu.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                  {bu.is_active ? 'Inativar' : 'Ativar'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-8 border border-slate-200 dark:border-white/10 rounded-xl p-4 md:p-5 bg-slate-50/70 dark:bg-white/5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Canais por Unidade</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure credenciais de Email e WhatsApp para cada BU.
            </p>
          </div>
          <div className="w-full md:w-80">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Unidade</label>
            <select
              value={selectedBusinessUnitId}
              onChange={(e) => setSelectedBusinessUnitId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            >
              {businessUnits.map((bu) => (
                <option key={bu.id} value={bu.id}>
                  {bu.code} - {bu.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!selectedBusinessUnit ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Crie ao menos uma unidade para configurar os canais.</p>
        ) : channelsLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Carregando configurações dos canais...</p>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-white dark:bg-black/20">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h5 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Email
                </h5>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={emailActive}
                    onChange={(e) => setEmailActive(e.target.checked)}
                    className="rounded border-slate-300 dark:border-white/20"
                  />
                  Canal ativo
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  value={emailConfig.senderName}
                  onChange={(e) => setEmailConfig((prev) => ({ ...prev, senderName: e.target.value }))}
                  placeholder="Nome do remetente"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-sm text-slate-900 dark:text-white"
                />
                <input
                  value={emailConfig.senderEmail}
                  onChange={(e) => setEmailConfig((prev) => ({ ...prev, senderEmail: e.target.value }))}
                  placeholder="Email remetente"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-sm text-slate-900 dark:text-white"
                />
                <input
                  value={emailConfig.replyTo}
                  onChange={(e) => setEmailConfig((prev) => ({ ...prev, replyTo: e.target.value }))}
                  placeholder="Reply-to"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-sm text-slate-900 dark:text-white"
                />
                <input
                  value={emailConfig.smtpHost}
                  onChange={(e) => setEmailConfig((prev) => ({ ...prev, smtpHost: e.target.value }))}
                  placeholder="SMTP host"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-sm text-slate-900 dark:text-white"
                />
                <input
                  value={emailConfig.smtpPort}
                  onChange={(e) => setEmailConfig((prev) => ({ ...prev, smtpPort: e.target.value }))}
                  placeholder="SMTP porta"
                  inputMode="numeric"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-sm text-slate-900 dark:text-white"
                />
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-sm text-slate-900 dark:text-white">
                  <input
                    type="checkbox"
                    checked={emailConfig.smtpSecure}
                    onChange={(e) => setEmailConfig((prev) => ({ ...prev, smtpSecure: e.target.checked }))}
                    className="rounded border-slate-300 dark:border-white/20"
                  />
                  SMTP seguro (TLS/SSL)
                </label>
                <input
                  value={emailConfig.smtpUsername}
                  onChange={(e) => setEmailConfig((prev) => ({ ...prev, smtpUsername: e.target.value }))}
                  placeholder="SMTP usuário"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-sm text-slate-900 dark:text-white"
                />
                <input
                  value={emailConfig.smtpPassword}
                  onChange={(e) => setEmailConfig((prev) => ({ ...prev, smtpPassword: e.target.value }))}
                  placeholder="SMTP senha/token"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={saveEmailSettings}
                  disabled={savingChannel !== null}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-500 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" /> Salvar Email
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-white dark:bg-black/20">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h5 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </h5>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={whatsappActive}
                    onChange={(e) => setWhatsappActive(e.target.checked)}
                    className="rounded border-slate-300 dark:border-white/20"
                  />
                  Canal ativo
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  value={whatsappConfig.provider}
                  onChange={(e) => setWhatsappConfig((prev) => ({ ...prev, provider: e.target.value }))}
                  placeholder="Provider (Meta/Twilio/etc.)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-sm text-slate-900 dark:text-white"
                />
                <input
                  value={whatsappConfig.fromNumber}
                  onChange={(e) => setWhatsappConfig((prev) => ({ ...prev, fromNumber: e.target.value }))}
                  placeholder="Número remetente"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-sm text-slate-900 dark:text-white"
                />
                <input
                  value={whatsappConfig.phoneNumberId}
                  onChange={(e) => setWhatsappConfig((prev) => ({ ...prev, phoneNumberId: e.target.value }))}
                  placeholder="Phone Number ID"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-sm text-slate-900 dark:text-white"
                />
                <input
                  value={whatsappConfig.businessAccountId}
                  onChange={(e) => setWhatsappConfig((prev) => ({ ...prev, businessAccountId: e.target.value }))}
                  placeholder="Business Account ID"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-sm text-slate-900 dark:text-white"
                />
                <input
                  value={whatsappConfig.accessToken}
                  onChange={(e) => setWhatsappConfig((prev) => ({ ...prev, accessToken: e.target.value }))}
                  placeholder="Access token"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-sm text-slate-900 dark:text-white"
                />
                <input
                  value={whatsappConfig.webhookUrl}
                  onChange={(e) => setWhatsappConfig((prev) => ({ ...prev, webhookUrl: e.target.value }))}
                  placeholder="Webhook URL"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={saveWhatsappSettings}
                  disabled={savingChannel !== null}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-500 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" /> Salvar WhatsApp
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SettingsSection>
  );
};
