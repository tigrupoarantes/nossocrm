'use client';

import React, { useState, useEffect } from 'react';
import { Mail, MessageCircle, Shield, Building2, CheckCircle, XCircle, Loader2, Eye, EyeOff } from 'lucide-react';
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

interface TwilioForm {
  accountSid: string;
  authToken: string;
  fromNumber: string;
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

interface ConfigStatus {
  smtp: boolean;
  twilio: boolean;
  serasa: boolean;
  customerBase: boolean;
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
  const [testing, setTesting] = useState<'smtp' | 'twilio' | null>(null);

  const [status, setStatus] = useState<ConfigStatus>({ smtp: false, twilio: false, serasa: false, customerBase: false });

  const [smtp, setSmtp] = useState<SmtpForm>({
    host: '', port: 587, secure: false, user: '', pass: '', fromName: '', fromEmail: '',
  });

  const [twilio, setTwilio] = useState<TwilioForm>({
    accountSid: '', authToken: '', fromNumber: '',
  });

  const [serasa, setSerasa] = useState<SerasaForm>({
    clientId: '', clientSecret: '', baseUrl: '', minimumScore: 500,
  });

  const [customerBase, setCustomerBase] = useState<CustomerBaseForm>({
    baseUrl: '', apiKey: '',
  });

  // Carregar configurações existentes
  useEffect(() => {
    fetch('/api/settings/communication')
      .then(r => r.json())
      .then(data => {
        setStatus(data.configured ?? {});
        if (data.smtp) {
          setSmtp(s => ({ ...s, ...data.smtp, pass: '' })); // não pré-preenche senha
        }
        if (data.twilio) {
          setTwilio(s => ({ ...s, ...data.twilio, authToken: '' }));
        }
        if (data.serasa) {
          setSerasa(s => ({ ...s, ...data.serasa, clientSecret: '' }));
        }
        if (data.customerBase) {
          setCustomerBase(s => ({ ...s, ...data.customerBase, apiKey: '' }));
        }
      })
      .catch(() => addToast('Erro ao carregar configurações', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};

      if (smtp.host) payload.smtp = smtp;
      if (twilio.accountSid) payload.twilio = twilio;
      if (serasa.clientId) payload.serasa = serasa;
      if (customerBase.baseUrl) payload.customerBase = customerBase;

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
        twilio: !!twilio.accountSid,
        serasa: !!serasa.clientId,
        customerBase: !!customerBase.baseUrl,
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

  const handleTestTwilio = async () => {
    setTesting('twilio');
    try {
      const res = await fetch('/api/settings/communication/test-twilio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(twilio),
      });
      const data = await res.json();
      if (data.ok) addToast('Credenciais Twilio válidas!', 'success');
      else addToast(`Falha Twilio: ${data.error}`, 'error');
    } catch {
      addToast('Erro ao testar Twilio', 'error');
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

      {/* Twilio WhatsApp */}
      <ConfigCard title="WhatsApp (Twilio)" icon={MessageCircle} configured={status.twilio}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Account SID">
            <input className={INPUT} value={twilio.accountSid} onChange={e => setTwilio(s => ({ ...s, accountSid: e.target.value }))} placeholder="ACxxxxxxxxxxxxxxxx" />
          </Field>
          <Field label="Auth Token">
            <PasswordField value={twilio.authToken} onChange={v => setTwilio(s => ({ ...s, authToken: v }))} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Número WhatsApp remetente">
              <input className={INPUT} value={twilio.fromNumber} onChange={e => setTwilio(s => ({ ...s, fromNumber: e.target.value }))} placeholder="+5511999999999" />
              <p className="text-xs text-slate-400 mt-1">Número aprovado no WhatsApp Business (com DDI)</p>
            </Field>
          </div>
        </div>
        <button
          onClick={handleTestTwilio}
          disabled={!twilio.accountSid || testing === 'twilio'}
          className="mt-2 flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-50 transition-colors"
        >
          {testing === 'twilio' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Testar credenciais Twilio
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
