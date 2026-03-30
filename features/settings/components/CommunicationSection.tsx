'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Mail, MessageCircle, Shield, Building2, CheckCircle, XCircle, Loader2, Eye, EyeOff, Smartphone, Copy, ExternalLink, Info } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

// =============================================================================
// Types
// =============================================================================

interface SmtpForm {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

interface MetaWhatsAppForm {
  phoneNumberId: string;
  accessToken: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  appSecret: string;
}

interface SerasaForm {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  minimumScore: number;
}

interface CustomerBaseForm {
  baseUrl: string;
  apiKey: string;
}

interface WahaForm {
  baseUrl: string;
  apiKey: string;
  sessionName: string;
}

type WahaSessionStatus = 'STOPPED' | 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED';

interface WahaSessionState {
  status: WahaSessionStatus | null;
  qr: string | null;
  loading: boolean;
}

interface ConfigStatus {
  smtp: boolean;
  metaWhatsApp: boolean;
  serasa: boolean;
  customerBase: boolean;
  waha: boolean;
}

// =============================================================================
// Subcomponentes auxiliares
// =============================================================================

function ConfigCard({ title, icon: Icon, configured, children }: {
  title: string;
  icon: React.ElementType;
  configured: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-200 dark:border-white/10 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          <span className="font-medium text-slate-900 dark:text-white text-sm">{title}</span>
        </div>
        {configured ? (
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <CheckCircle className="h-3.5 w-3.5" /> Configurado
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <XCircle className="h-3.5 w-3.5" /> Não configurado
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

const INPUT = "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent";

function PasswordField({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '••••••••'}
        className={INPUT + ' pr-10'}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// =============================================================================
// Componente principal
// =============================================================================

export function CommunicationSection() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<'smtp' | 'meta' | 'waha' | null>(null);

  const [status, setStatus] = useState<ConfigStatus>({ smtp: false, metaWhatsApp: false, serasa: false, customerBase: false, waha: false });

  const [smtp, setSmtp] = useState<SmtpForm>({
    host: '', port: 587, secure: false, user: '', pass: '', fromName: '', fromEmail: '',
  });

  const [meta, setMeta] = useState<MetaWhatsAppForm>({
    phoneNumberId: '',
    accessToken: '',
    businessAccountId: '',
    webhookVerifyToken: '',
    appSecret: '',
  });

  const [serasa, setSerasa] = useState<SerasaForm>({
    clientId: '', clientSecret: '', baseUrl: '', minimumScore: 500,
  });

  const [customerBase, setCustomerBase] = useState<CustomerBaseForm>({
    baseUrl: '', apiKey: '',
  });

  const [waha, setWaha] = useState<WahaForm>({
    baseUrl: '', apiKey: '', sessionName: 'default',
  });

  const [wahaSession, setWahaSession] = useState<WahaSessionState>({
    status: null, qr: null, loading: false,
  });

  const wahaQrInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Carregar configurações existentes
  useEffect(() => {
    fetch('/api/settings/communication')
      .then(r => r.json())
      .then(data => {
        setStatus(data.configured ?? {});
        if (data.smtp) {
          // Mantém o valor mascarado '••••••••' — o servidor sabe preservar o valor existente
          setSmtp(s => ({ ...s, ...data.smtp }));
        }
        if (data.metaWhatsApp) {
          setMeta(s => ({ ...s, ...data.metaWhatsApp }));
        }
        if (data.serasa) {
          setSerasa(s => ({ ...s, ...data.serasa }));
        }
        if (data.customerBase) {
          setCustomerBase(s => ({ ...s, ...data.customerBase }));
        }
        if (data.waha) {
          setWaha(s => ({ ...s, ...data.waha }));
        }
      })
      .catch(() => addToast('Erro ao carregar configurações', 'error'))
      .finally(() => setLoading(false));
  }, []);

  // Limpar interval do QR ao desmontar
  useEffect(() => {
    return () => {
      if (wahaQrInterval.current) clearInterval(wahaQrInterval.current);
    };
  }, []);

  const fetchWahaSession = async () => {
    setWahaSession(s => ({ ...s, loading: true }));
    try {
      const res = await fetch('/api/settings/communication/waha-session');
      if (!res.ok) {
        setWahaSession({ status: 'STOPPED', qr: null, loading: false });
        return;
      }
      const data = await res.json() as { status: { status: WahaSessionStatus }; qr?: { value: string } | null };
      setWahaSession({
        status: data.status?.status ?? 'STOPPED',
        qr: data.qr?.value ?? null,
        loading: false,
      });
    } catch {
      setWahaSession({ status: 'STOPPED', qr: null, loading: false });
    }
  };

  const handleWahaStartSession = async () => {
    try {
      const res = await fetch('/api/settings/communication/waha-session', { method: 'POST' });
      if (!res.ok) {
        addToast('Erro ao iniciar sessão WAHA', 'error');
        return;
      }
      addToast('Sessão iniciada. Aguardando QR...', 'info');
      await fetchWahaSession();
      // Auto-refresh enquanto aguarda scan
      wahaQrInterval.current = setInterval(async () => {
        await fetchWahaSession();
        if (wahaSession.status === 'WORKING') {
          if (wahaQrInterval.current) clearInterval(wahaQrInterval.current);
        }
      }, 5000);
    } catch {
      addToast('Erro ao iniciar sessão WAHA', 'error');
    }
  };

  const handleWahaStopSession = async () => {
    try {
      if (wahaQrInterval.current) clearInterval(wahaQrInterval.current);
      const res = await fetch('/api/settings/communication/waha-session', { method: 'DELETE' });
      if (!res.ok) {
        addToast('Erro ao encerrar sessão WAHA', 'error');
        return;
      }
      addToast('Sessão encerrada', 'success');
      setWahaSession({ status: 'STOPPED', qr: null, loading: false });
    } catch {
      addToast('Erro ao encerrar sessão WAHA', 'error');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};

      if (smtp.host) payload.smtp = smtp;
      if (meta.phoneNumberId) payload.metaWhatsApp = meta;
      if (serasa.clientId) payload.serasa = serasa;
      if (customerBase.baseUrl) payload.customerBase = customerBase;
      if (waha.baseUrl) payload.waha = waha;

      const res = await fetch('/api/settings/communication', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Erro ao salvar');

      addToast('Configurações salvas com sucesso!', 'success');

      // Atualizar status
      setStatus({
        smtp: !!smtp.host,
        metaWhatsApp: !!meta.phoneNumberId,
        serasa: !!serasa.clientId,
        customerBase: !!customerBase.baseUrl,
        waha: !!waha.baseUrl,
      });
    } catch {
      addToast('Erro ao salvar configurações', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    setTesting('smtp');
    try {
      const res = await fetch('/api/settings/communication/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(smtp),
      });
      const data = await res.json();
      if (data.ok) addToast('Conexão SMTP funcionando!', 'success');
      else addToast(`Falha SMTP: ${data.error}`, 'error');
    } catch {
      addToast('Erro ao testar SMTP', 'error');
    } finally {
      setTesting(null);
    }
  };

  const handleTestMeta = async () => {
    setTesting('meta');
    try {
      const res = await fetch('/api/settings/communication/test-meta-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId: meta.phoneNumberId, accessToken: meta.accessToken }),
      });
      const data = await res.json() as { ok: boolean; phoneNumber?: string; displayPhoneNumber?: string; error?: string };
      if (data.ok) {
        const label = data.displayPhoneNumber ?? data.phoneNumber ?? 'número verificado';
        addToast(`Meta API OK — ${label}`, 'success');
      } else {
        addToast(`Falha Meta: ${data.error ?? 'Credenciais inválidas'}`, 'error');
      }
    } catch {
      addToast('Erro ao testar Meta WhatsApp', 'error');
    } finally {
      setTesting(null);
    }
  };

  const handleTestWaha = async () => {
    setTesting('waha');
    try {
      const res = await fetch('/api/settings/communication/test-waha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(waha),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) addToast('Conexão WAHA funcionando!', 'success');
      else addToast(`Falha WAHA: ${data.error ?? 'Erro desconhecido'}`, 'error');
    } catch {
      addToast('Erro ao testar WAHA', 'error');
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Configure os canais de comunicação usados pelas automações do Funil de Qualificação.
      </p>

      {/* SMTP */}
      <ConfigCard title="E-mail (SMTP)" icon={Mail} configured={status.smtp}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Servidor SMTP">
            <input className={INPUT} value={smtp.host} onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))} placeholder="smtp.gmail.com" />
          </Field>
          <Field label="Porta">
            <input className={INPUT} type="number" value={smtp.port} onChange={e => setSmtp(s => ({ ...s, port: Number(e.target.value) }))} />
          </Field>
          <Field label="Usuário">
            <input className={INPUT} value={smtp.user} onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))} placeholder="usuario@empresa.com" />
          </Field>
          <Field label="Senha">
            <PasswordField value={smtp.pass} onChange={v => setSmtp(s => ({ ...s, pass: v }))} />
          </Field>
          <Field label="Nome do Remetente">
            <input className={INPUT} value={smtp.fromName} onChange={e => setSmtp(s => ({ ...s, fromName: e.target.value }))} placeholder="Equipe Comercial" />
          </Field>
          <Field label="E-mail do Remetente">
            <input className={INPUT} type="email" value={smtp.fromEmail} onChange={e => setSmtp(s => ({ ...s, fromEmail: e.target.value }))} placeholder="contato@empresa.com" />
          </Field>
          <Field label="Conexão segura (TLS)">
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input type="checkbox" checked={smtp.secure} onChange={e => setSmtp(s => ({ ...s, secure: e.target.checked }))} className="rounded" />
              <span className="text-sm text-slate-700 dark:text-slate-300">SSL/TLS (porta 465)</span>
            </label>
          </Field>
        </div>
        <button
          onClick={handleTestSmtp}
          disabled={!smtp.host || testing === 'smtp'}
          className="mt-2 flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-50 transition-colors"
        >
          {testing === 'smtp' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Testar conexão SMTP
        </button>
      </ConfigCard>

      {/* Meta WhatsApp Cloud API */}
      <ConfigCard title="WhatsApp (Meta Cloud API)" icon={MessageCircle} configured={status.metaWhatsApp}>
        {/* Info banner */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 rounded-lg text-xs text-blue-800 dark:text-blue-300">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            API oficial da Meta — envio direto pelo WhatsApp Business Platform, sem intermediários.{' '}
            <a
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-0.5"
            >
              Documentação <ExternalLink className="h-3 w-3" />
            </a>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Phone Number ID">
            <input
              className={INPUT}
              value={meta.phoneNumberId}
              onChange={e => setMeta(s => ({ ...s, phoneNumberId: e.target.value }))}
              placeholder="123456789012345"
            />
            <p className="text-xs text-slate-400 mt-1">Encontrado em Meta for Developers → WhatsApp → API Setup</p>
          </Field>
          <Field label="Business Account ID (opcional)">
            <input
              className={INPUT}
              value={meta.businessAccountId}
              onChange={e => setMeta(s => ({ ...s, businessAccountId: e.target.value }))}
              placeholder="987654321098765"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Access Token">
              <PasswordField
                value={meta.accessToken}
                onChange={v => setMeta(s => ({ ...s, accessToken: v }))}
                placeholder="EAAxxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <p className="text-xs text-slate-400 mt-1">Token de acesso do sistema gerado em Meta for Developers</p>
            </Field>
          </div>
          <Field label="App Secret (opcional — para validar webhook)">
            <PasswordField
              value={meta.appSecret}
              onChange={v => setMeta(s => ({ ...s, appSecret: v }))}
              placeholder="abc123def456..."
            />
          </Field>
          <Field label="Webhook Verify Token">
            <input
              className={INPUT}
              value={meta.webhookVerifyToken}
              onChange={e => setMeta(s => ({ ...s, webhookVerifyToken: e.target.value }))}
              placeholder="nossocrm-meta-verify"
            />
            <p className="text-xs text-slate-400 mt-1">Token secreto que a Meta usa para verificar o webhook</p>
          </Field>
        </div>

        {/* Webhook URL (readonly) */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            URL do Webhook <span className="text-slate-400">(copiar para Meta for Developers)</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              readOnly
              className={INPUT + ' bg-slate-100 dark:bg-white/10 cursor-default select-all'}
              value="https://crm.grupoarantes.emp.br/api/webhooks/meta-whatsapp"
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText('https://crm.grupoarantes.emp.br/api/webhooks/meta-whatsapp');
                addToast('URL copiada!', 'success');
              }}
              className="flex-shrink-0 p-2 text-slate-500 hover:text-primary-600 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              title="Copiar URL"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Configure em Meta for Developers → WhatsApp → Configuration → Webhook. Inscreva o campo <code className="bg-slate-100 dark:bg-white/10 px-1 rounded">messages</code>.
          </p>
        </div>

        <button
          onClick={handleTestMeta}
          disabled={!meta.phoneNumberId || !meta.accessToken || testing === 'meta'}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-50 transition-colors"
        >
          {testing === 'meta' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Testar credenciais Meta
        </button>
      </ConfigCard>

      {/* SERASA */}
      <ConfigCard title="SERASA Experian" icon={Shield} configured={status.serasa}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Client ID">
            <input className={INPUT} value={serasa.clientId} onChange={e => setSerasa(s => ({ ...s, clientId: e.target.value }))} />
          </Field>
          <Field label="Client Secret">
            <PasswordField value={serasa.clientSecret} onChange={v => setSerasa(s => ({ ...s, clientSecret: v }))} />
          </Field>
          <Field label="URL base da API">
            <input className={INPUT} value={serasa.baseUrl} onChange={e => setSerasa(s => ({ ...s, baseUrl: e.target.value }))} placeholder="https://api.serasaexperian.com.br" />
          </Field>
          <Field label="Score mínimo de aprovação">
            <input className={INPUT} type="number" value={serasa.minimumScore} onChange={e => setSerasa(s => ({ ...s, minimumScore: Number(e.target.value) }))} min={0} max={1000} />
            <p className="text-xs text-slate-400 mt-1">Leads abaixo deste score vão para Desqualificado</p>
          </Field>
        </div>
      </ConfigCard>

      {/* FLAG x SAP */}
      <ConfigCard title="Base de Clientes FLAG/SAP" icon={Building2} configured={status.customerBase}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="URL da API">
            <input className={INPUT} value={customerBase.baseUrl} onChange={e => setCustomerBase(s => ({ ...s, baseUrl: e.target.value }))} placeholder="https://api.flag.com.br" />
          </Field>
          <Field label="API Key">
            <PasswordField value={customerBase.apiKey} onChange={v => setCustomerBase(s => ({ ...s, apiKey: v }))} />
          </Field>
        </div>
        <p className="text-xs text-slate-400">
          Usada no D+0 para verificar se o CNPJ já é cliente ativo. Não bloqueia o fluxo — apenas registra no card.
        </p>
      </ConfigCard>

      {/* WAHA WhatsApp */}
      <ConfigCard title="WhatsApp (WAHA)" icon={Smartphone} configured={status.waha}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Field label="URL base do servidor WAHA">
              <input className={INPUT} value={waha.baseUrl} onChange={e => setWaha(s => ({ ...s, baseUrl: e.target.value }))} placeholder="http://localhost:3000" />
              <p className="text-xs text-slate-400 mt-1">Endereço onde o WAHA está rodando (ex.: Docker local ou VPS)</p>
            </Field>
          </div>
          <Field label="API Key">
            <PasswordField value={waha.apiKey} onChange={v => setWaha(s => ({ ...s, apiKey: v }))} />
          </Field>
          <Field label="Nome da sessão">
            <input className={INPUT} value={waha.sessionName} onChange={e => setWaha(s => ({ ...s, sessionName: e.target.value }))} placeholder="default" />
          </Field>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleTestWaha}
            disabled={!waha.baseUrl || testing === 'waha'}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-50 transition-colors"
          >
            {testing === 'waha' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Testar conexão
          </button>
          {status.waha && (
            <button
              onClick={fetchWahaSession}
              disabled={wahaSession.loading}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
            >
              {wahaSession.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Ver status da sessão
            </button>
          )}
        </div>

        {/* Painel de sessão */}
        {wahaSession.status && (
          <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  wahaSession.status === 'WORKING' ? 'bg-green-500' :
                  wahaSession.status === 'SCAN_QR_CODE' ? 'bg-yellow-500 animate-pulse' :
                  'bg-red-400'
                }`} />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {wahaSession.status === 'WORKING' ? 'Conectado' :
                   wahaSession.status === 'SCAN_QR_CODE' ? 'Aguardando escaneamento do QR' :
                   wahaSession.status === 'STARTING' ? 'Iniciando...' :
                   'Desconectado'}
                </span>
              </div>
              <div className="flex gap-2">
                {wahaSession.status !== 'WORKING' && wahaSession.status !== 'STARTING' && (
                  <button
                    onClick={handleWahaStartSession}
                    className="text-xs px-2 py-1 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 rounded hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                  >
                    Iniciar sessão
                  </button>
                )}
                {(wahaSession.status === 'WORKING' || wahaSession.status === 'STARTING') && (
                  <button
                    onClick={handleWahaStopSession}
                    className="text-xs px-2 py-1 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    Encerrar sessão
                  </button>
                )}
              </div>
            </div>
            {wahaSession.status === 'SCAN_QR_CODE' && wahaSession.qr && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Abra o WhatsApp no celular → Dispositivos conectados → Conectar um dispositivo
                </p>
                {wahaSession.qr.startsWith('data:') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={wahaSession.qr} alt="QR Code WAHA" className="w-48 h-48 border border-slate-200 dark:border-white/10 rounded-lg" />
                ) : (
                  <div className="p-2 bg-white rounded-lg">
                    <p className="text-xs font-mono break-all text-slate-600 max-w-xs">{wahaSession.qr}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-2">
          Gateway WhatsApp self-hosted. Alternativa à Meta Cloud API — sem custo por mensagem. Requer Docker.
        </p>
      </ConfigCard>

      {/* Salvar */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 disabled:opacity-50 rounded-xl transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar configurações
        </button>
      </div>
    </div>
  );
}
