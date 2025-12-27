import React, { useMemo, useState } from 'react';
import { ServerCog, Copy, ExternalLink, CheckCircle2, Play, KeyRound, TerminalSquare, AlertTriangle } from 'lucide-react';
import { useOptionalToast } from '@/context/ToastContext';
import { SettingsSection } from './SettingsSection';

/**
 * Seção de configurações para MCP (Model Context Protocol).
 * Expõe o CRM como MCP Server via `/api/mcp`.
 */
export const McpSection: React.FC = () => {
  const { addToast } = useOptionalToast();

  const endpointPath = '/api/mcp';
  const metadataUrl = '/api/mcp';

  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    toolsCount?: number;
    toolsPreview?: string[];
    testedAtIso?: string;
  } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const origin = useMemo(() => (typeof window !== 'undefined' ? window.location.origin : ''), []);
  const fullEndpoint = useMemo(() => (origin ? `${origin}${endpointPath}` : endpointPath), [origin]);
  const inspectorCommand = useMemo(
    () => `npx @modelcontextprotocol/inspector@latest ${fullEndpoint}`,
    [fullEndpoint]
  );

  const curlInitialize = useMemo(() => {
    return `curl -sS -X POST '${fullEndpoint}' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer <API_KEY>' \\
  -H 'MCP-Protocol-Version: 2025-11-25' \\
  --data-raw '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"curl","version":"0"},"capabilities":{}}}'`;
  }, [fullEndpoint]);

  const curlToolsList = useMemo(() => {
    return `curl -sS -X POST '${fullEndpoint}' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer <API_KEY>' \\
  -H 'MCP-Protocol-Version: 2025-11-25' \\
  --data-raw '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'`;
  }, [fullEndpoint]);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addToast(`${label} copiado.`, 'success');
    } catch {
      addToast(`Não foi possível copiar ${label.toLowerCase()}.`, 'error');
    }
  };

  const navigateToApiKeys = () => {
    try {
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.hash = '#api';
        window.history.replaceState({}, '', url.toString());
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    } catch {
      // best-effort
    }
  };

  const parseJsonSafe = async (res: Response) => {
    const text = await res.text().catch(() => '');
    if (!text) return { json: null as any, text: '' };
    try {
      return { json: JSON.parse(text), text };
    } catch {
      return { json: null as any, text };
    }
  };

  const testConnection = async () => {
    const token = apiKey.trim();
    if (!token) {
      addToast('Cole uma API key para testar.', 'warning');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const commonHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-11-25',
        // Prefer Bearer for MCP clients; also send X-Api-Key for compatibility.
        Authorization: `Bearer ${token}`,
        'X-Api-Key': token,
      };

      // 1) initialize
      const initRes = await fetch(endpointPath, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { clientInfo: { name: 'crm-settings-ui', version: '0' }, capabilities: {} },
        }),
      });
      const initParsed = await parseJsonSafe(initRes);
      if (!initRes.ok) {
        const msg =
          initParsed?.json?.error?.message ||
          initParsed?.json?.error ||
          initParsed?.json?.message ||
          initParsed?.json?.detail ||
          initParsed?.json?.data?.error ||
          initParsed?.text ||
          'Falha ao conectar';
        setTestResult({ ok: false, message: `Erro no initialize: ${String(msg)}`, testedAtIso: new Date().toISOString() });
        return;
      }

      // 2) tools/list
      const listRes = await fetch(endpointPath, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      });
      const listParsed = await parseJsonSafe(listRes);
      if (!listRes.ok) {
        const msg =
          listParsed?.json?.error?.message ||
          listParsed?.json?.error ||
          listParsed?.json?.message ||
          listParsed?.json?.detail ||
          listParsed?.text ||
          'Falha ao listar tools';
        setTestResult({ ok: false, message: `Erro no tools/list: ${String(msg)}`, testedAtIso: new Date().toISOString() });
        return;
      }

      const tools = (listParsed?.json?.result?.tools as any[]) || [];
      const toolsPreview = tools
        .map((t) => t?.name)
        .filter((v) => typeof v === 'string')
        .slice(0, 8) as string[];

      setTestResult({
        ok: true,
        message: 'Conectado. MCP respondeu corretamente.',
        toolsCount: tools.length,
        toolsPreview,
        testedAtIso: new Date().toISOString(),
      });
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.message || 'Erro no teste', testedAtIso: new Date().toISOString() });
    } finally {
      setTesting(false);
    }
  };

  return (
    <SettingsSection title="MCP" icon={ServerCog}>
      <div className="mt-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Conecte assistentes e automações ao CRM via MCP (Model Context Protocol).
          <br />
          <span className="font-semibold text-slate-700 dark:text-slate-200">Compatível agora:</span> MCP Inspector e clientes MCP onde você controla headers.
          <br />
          <span className="font-semibold text-slate-700 dark:text-slate-200">ChatGPT:</span> exige OAuth para MCP autenticado (Fase 2).
        </p>

        {/* Status */}
        <div className="mt-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Status</div>
              <div className="text-sm">
                {testResult?.ok ? (
                  <span className="inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    Conectado
                  </span>
                ) : testResult ? (
                  <span className="inline-flex items-center gap-2 text-rose-700 dark:text-rose-300 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    Falha no teste
                  </span>
                ) : (
                  <span className="text-slate-600 dark:text-slate-300">Ainda não testado</span>
                )}
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Endpoint: <span className="font-mono">POST {endpointPath}</span>
              </div>
              {testResult?.testedAtIso && (
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Último teste: {new Date(testResult.testedAtIso).toLocaleString('pt-BR')}
                </div>
              )}
              {testResult?.ok && typeof testResult.toolsCount === 'number' && (
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Tools disponíveis: <span className="font-semibold text-slate-700 dark:text-slate-200">{testResult.toolsCount}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => copy('URL completa', fullEndpoint)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
              >
                <Copy className="h-4 w-4" />
                Copiar URL completa
              </button>
              <a
                href={metadataUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir metadata (JSON)
              </a>
            </div>
          </div>

          {testResult?.message && (
            <div className={`mt-3 text-sm ${testResult.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
              {testResult.message}
            </div>
          )}

          {testResult?.ok && testResult.toolsPreview?.length ? (
            <div className="mt-3">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Exemplo de tools</div>
              <div className="flex flex-wrap gap-2">
                {testResult.toolsPreview.map((t) => (
                  <span
                    key={t}
                    className="text-xs font-mono px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-black/20 text-slate-800 dark:text-slate-100"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Conectar (3 passos) */}
        <div className="mt-4 grid grid-cols-1 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-4">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
              Passo 1 — Gere uma API key
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mb-3">
              A chave autentica o MCP e limita o acesso à sua organização.
            </div>
            <button
              type="button"
              onClick={navigateToApiKeys}
              className="px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <KeyRound className="h-4 w-4" />
              Ir para API Keys
            </button>
            <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              Dica: use o hash <span className="font-mono">#api</span> para abrir direto: <span className="font-mono">/settings/integracoes#api</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-4">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
              Passo 2 — Cole a API key (fica só em memória)
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mb-3">
              Autenticação: <span className="font-mono">Authorization: Bearer {'<API_KEY>'}</span> (ou <span className="font-mono">X-Api-Key</span>).
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="min-w-[260px] flex-1 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white font-mono text-xs"
                placeholder="Cole aqui sua API key (não é salva)"
              />
              <button
                type="button"
                onClick={() => copy('Header Authorization', `Authorization: Bearer ${apiKey.trim() || '<API_KEY>'}`)}
                className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
              >
                <Copy className="h-4 w-4" />
                Copiar header
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-4">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
              Passo 3 — Testar conexão
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mb-3">
              Esse teste chama <span className="font-mono">initialize</span> e <span className="font-mono">tools/list</span>. Se der OK aqui, está pronto para o Inspector e para clientes MCP.
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={testConnection}
                disabled={testing}
                className="px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2"
              >
                <Play className="h-4 w-4" />
                {testing ? 'Testando…' : 'Testar conexão'}
              </button>
              <button
                type="button"
                onClick={() => copy('Comando MCP Inspector', inspectorCommand)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
              >
                <TerminalSquare className="h-4 w-4" />
                Copiar comando Inspector
              </button>
            </div>
          </div>
        </div>

        {/* Como testar agora */}
        <div className="mt-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-4">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Como testar agora (recomendado)</div>
          <div className="text-xs text-slate-600 dark:text-slate-300 mb-3">
            Use o MCP Inspector para listar tools e chamar <span className="font-mono">tools/call</span> com segurança.
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copy('URL do MCP', fullEndpoint)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <Copy className="h-4 w-4" />
              Copiar URL do MCP
            </button>
            <button
              type="button"
              onClick={() => copy('Comando', inspectorCommand)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <TerminalSquare className="h-4 w-4" />
              Copiar comando
            </button>
          </div>

          <div className="mt-3 text-xs font-mono whitespace-pre-wrap rounded-lg border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-black/20 p-3 text-slate-800 dark:text-slate-100">
            {inspectorCommand}
          </div>
        </div>

        {/* Detalhes técnicos (colapsável) */}
        <div className="mt-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100"
          >
            <span className="inline-flex items-center gap-2">
              <TerminalSquare className="h-4 w-4" />
              Detalhes técnicos (curl / métodos MCP)
            </span>
            <span className="text-slate-500 dark:text-slate-400">{showAdvanced ? 'Ocultar' : 'Mostrar'}</span>
          </button>

          {showAdvanced && (
            <div className="px-4 pb-4">
              <div className="text-xs text-slate-600 dark:text-slate-300 mb-3">
                O endpoint MCP aceita JSON-RPC 2.0 em <span className="font-mono">POST {endpointPath}</span>. Métodos principais: <span className="font-mono">initialize</span>, <span className="font-mono">tools/list</span>, <span className="font-mono">tools/call</span>.
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => copy('cURL initialize', curlInitialize)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
                >
                  <TerminalSquare className="h-4 w-4" />
                  Copiar initialize
                </button>
                <button
                  type="button"
                  onClick={() => copy('cURL tools/list', curlToolsList)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
                >
                  <TerminalSquare className="h-4 w-4" />
                  Copiar tools/list
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">initialize</div>
                  <pre className="text-xs font-mono whitespace-pre-wrap rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-3 text-slate-800 dark:text-slate-100">
                    {curlInitialize}
                  </pre>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">tools/list</div>
                  <pre className="text-xs font-mono whitespace-pre-wrap rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-3 text-slate-800 dark:text-slate-100">
                    {curlToolsList}
                  </pre>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3">
                <div className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1 inline-flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  ChatGPT (Fase 2)
                </div>
                <div className="text-xs text-amber-800/80 dark:text-amber-200/80">
                  Para conectar no ChatGPT, o MCP autenticado precisa de OAuth 2.1/PKCE. Esta tela cobre a Fase 1 (API key) para Inspector e clientes MCP controlados por você.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </SettingsSection>
  );
};

