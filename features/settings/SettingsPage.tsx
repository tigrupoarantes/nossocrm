import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSettingsController } from './hooks/useSettingsController';
import { TagsManager } from './components/TagsManager';
import { CustomFieldsManager } from './components/CustomFieldsManager';
import { ApiKeysSection } from './components/ApiKeysSection';
import { WebhooksSection } from './components/WebhooksSection';
import { McpSection } from './components/McpSection';
import { DataStorageSettings } from './components/DataStorageSettings';
import { ProductsCatalogManager } from './components/ProductsCatalogManager';
import { AICenterSettings } from './AICenterSettings';
import { BusinessUnitsSection } from './components/BusinessUnitsSection';
import { DepartmentsSettings } from './components/DepartmentsSettings';
import { NotificationPreferences } from './components/NotificationPreferences';
import { AICreditsCard } from './components/AICreditsCard';
import { FacebookCAPISettings } from './components/FacebookCAPISettings';

import { UsersPage } from './UsersPage';
import { CommunicationSection } from './components/CommunicationSection';
import { useAuth } from '@/context/AuthContext';
import { Settings as SettingsIcon, Users, Database, Sparkles, Plug, Package, Building2, MessageSquare, Users2, Bell, Cpu, Zap, Send } from 'lucide-react';

type SettingsTab = 'general' | 'products' | 'businessUnits' | 'integrations' | 'ai' | 'data' | 'users' | 'communication' | 'departments' | 'notifications' | 'credits' | 'capi' | 'dispatch';

interface GeneralSettingsProps {
  hash?: string;
  isAdmin: boolean;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({ hash, isAdmin }) => {
  const controller = useSettingsController();

  // Scroll to hash element (e.g., #ai-config)
  useEffect(() => {
    if (hash) {
      const elementId = hash.slice(1); // Remove #
      setTimeout(() => {
        const element = document.getElementById(elementId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [hash]);


  return (
    <div className="pb-10">
      {/* General Settings */}
      <div className="mb-12">
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Página Inicial</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Escolha qual tela deve abrir quando você iniciar o CRM.
          </p>
          <select
            aria-label="Selecionar página inicial"
            value={controller.defaultRoute}
            onChange={(e) => controller.setDefaultRoute(e.target.value)}
            className="w-full max-w-xs px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 dark:text-white transition-all"
          >
            <option value="/dashboard">Dashboard</option>
            <option value="/inbox-list">Inbox (Lista)</option>
            <option value="/inbox-focus">Inbox (Foco)</option>
            <option value="/boards">Boards (Kanban)</option>
            <option value="/contacts">Contatos</option>
            <option value="/activities">Atividades</option>
            <option value="/reports">Relatórios</option>
          </select>
        </div>
      </div>

      {isAdmin && (
        <>
          <TagsManager
            availableTags={controller.availableTags}
            newTagName={controller.newTagName}
            setNewTagName={controller.setNewTagName}
            onAddTag={controller.handleAddTag}
            onRemoveTag={controller.removeTag}
          />

          <CustomFieldsManager
            customFieldDefinitions={controller.customFieldDefinitions}
            newFieldLabel={controller.newFieldLabel}
            setNewFieldLabel={controller.setNewFieldLabel}
            newFieldType={controller.newFieldType}
            setNewFieldType={controller.setNewFieldType}
            newFieldOptions={controller.newFieldOptions}
            setNewFieldOptions={controller.setNewFieldOptions}
            editingId={controller.editingId}
            onStartEditing={controller.startEditingField}
            onCancelEditing={controller.cancelEditingField}
            onSaveField={controller.handleSaveField}
            onRemoveField={controller.removeCustomField}
          />
        </>
      )}

    </div>
  );
};

const ProductsSettings: React.FC = () => {
  return (
    <div className="pb-10">
      <ProductsCatalogManager />
    </div>
  );
};

const BusinessUnitsSettings: React.FC = () => {
  return (
    <div className="pb-10">
      <BusinessUnitsSection />
    </div>
  );
};

const IntegrationsSettings: React.FC = () => {
  type IntegrationsSubTab = 'api' | 'webhooks' | 'mcp';
  const [subTab, setSubTab] = useState<IntegrationsSubTab>('api');

  useEffect(() => {
    const syncFromHash = () => {
    const h = typeof window !== 'undefined' ? (window.location.hash || '').replace('#', '') : '';
    if (h === 'webhooks' || h === 'api' || h === 'mcp') setSubTab(h as IntegrationsSubTab);
    };

    syncFromHash();

    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', syncFromHash);
      return () => window.removeEventListener('hashchange', syncFromHash);
    }
  }, []);

  const setSubTabAndHash = (t: IntegrationsSubTab) => {
    setSubTab(t);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.hash = `#${t}`;
      window.history.replaceState({}, '', url.toString());
    }
  };

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2 mb-6">
        {([
          { id: 'webhooks' as const, label: 'Webhooks' },
          { id: 'api' as const, label: 'API' },
          { id: 'mcp' as const, label: 'MCP' },
        ] as const).map((t) => {
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTabAndHash(t.id)}
              className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                active
                  ? 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {subTab === 'api' && <ApiKeysSection />}
      {subTab === 'webhooks' && <WebhooksSection />}
      {subTab === 'mcp' && <McpSection />}
    </div>
  );
};

interface SettingsPageProps {
  tab?: SettingsTab;
}

/**
 * Componente React `SettingsPage`.
 *
 * @param {SettingsPageProps} { tab: initialTab } - Parâmetro `{ tab: initialTab }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
const SettingsPage: React.FC<SettingsPageProps> = ({ tab: initialTab }) => {
  const { profile } = useAuth();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'general');

  // Get hash from URL for scrolling
  const hash = typeof window !== 'undefined' ? window.location.hash : '';

  // Determine tab from pathname if available
  useEffect(() => {
    if (pathname?.includes('/settings/ai')) {
      setActiveTab('ai');
    } else if (pathname?.includes('/settings/products')) {
      setActiveTab('products');
    } else if (pathname?.includes('/settings/unidades')) {
      setActiveTab('businessUnits');
    } else if (pathname?.includes('/settings/integracoes')) {
      setActiveTab('integrations');
    } else if (pathname?.includes('/settings/data')) {
      setActiveTab('data');
    } else if (pathname?.includes('/settings/users')) {
      setActiveTab('users');
    } else {
      setActiveTab('general');
    }
  }, [pathname]);

  const isAdmin = profile?.role === 'admin';

  type SidebarItem = { id: SettingsTab; name: string; icon: React.ComponentType<{ className?: string }> };
  const sidebarGroups: Array<{ label: string; items: SidebarItem[] }> = [
    {
      label: 'Geral',
      items: [
        { id: 'general' as SettingsTab, name: 'Geral', icon: SettingsIcon },
        ...(isAdmin ? [{ id: 'departments' as SettingsTab, name: 'Departamentos', icon: Users2 }] : []),
        ...(isAdmin ? [{ id: 'communication' as SettingsTab, name: 'Comunicação', icon: MessageSquare }] : []),
        ...(isAdmin ? [{ id: 'users' as SettingsTab, name: 'Equipe', icon: Users }] : []),
      ] as SidebarItem[],
    },
    ...(isAdmin ? [{
      label: 'Organização',
      items: [
        { id: 'products' as SettingsTab, name: 'Produtos/Serviços', icon: Package },
        { id: 'businessUnits' as SettingsTab, name: 'Unidades', icon: Building2 },
      ] as SidebarItem[],
    }] : []),
    ...(isAdmin ? [{
      label: 'Integrações',
      items: [
        { id: 'integrations' as SettingsTab, name: 'API & Webhooks', icon: Plug },
        { id: 'dispatch' as SettingsTab, name: 'Disparo', icon: Send },
        { id: 'capi' as SettingsTab, name: 'Facebook CAPI', icon: Zap },
      ] as SidebarItem[],
    }] : []),
    {
      label: 'Inteligência Artificial',
      items: [
        { id: 'ai' as SettingsTab, name: 'Central de IA', icon: Sparkles },
        { id: 'credits' as SettingsTab, name: 'Créditos IA', icon: Cpu },
      ] as SidebarItem[],
    },
    {
      label: 'Preferências',
      items: [
        { id: 'notifications' as SettingsTab, name: 'Notificações', icon: Bell },
        { id: 'data' as SettingsTab, name: 'Dados', icon: Database },
      ] as SidebarItem[],
    },
  ].filter((g) => g.items.length > 0);

  const renderContent = () => {
    switch (activeTab) {
      case 'products':
        return <ProductsSettings />;
      case 'businessUnits':
        return <BusinessUnitsSettings />;
      case 'integrations':
        return <IntegrationsSettings />;
      case 'communication':
        return (
          <div className="pb-10">
            <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                <MessageSquare className="h-5 w-5" /> Canais de Comunicação
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Configure e-mail (SMTP), WhatsApp (Twilio), SERASA e base FLAG/SAP para as automações do Funil de Qualificação.
              </p>
              <CommunicationSection />
            </div>
          </div>
        );
      case 'ai':
        return <AICenterSettings />;
      case 'data':
        return <DataStorageSettings />;
      case 'users':
        return <UsersPage />;
      case 'departments':
        return (
          <div className="pb-10">
            <DepartmentsSettings />
          </div>
        );
      case 'notifications':
        return (
          <div className="pb-10">
            <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                <Bell className="h-5 w-5" /> Preferências de Notificação
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Configure quais alertas você deseja receber e por quais canais.
              </p>
              <NotificationPreferences />
            </div>
          </div>
        );
      case 'credits':
        return (
          <div className="pb-10">
            <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                <Cpu className="h-5 w-5" /> Créditos de IA
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Acompanhe o consumo de créditos da IA e veja o histórico de uso.
              </p>
              <AICreditsCard />
            </div>
          </div>
        );
      case 'capi':
        return (
          <div className="pb-10">
            <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                <Zap className="h-5 w-5" /> Facebook Conversions API
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Configure o rastreamento server-side de conversões para o Facebook Ads.
              </p>
              <FacebookCAPISettings />
            </div>
          </div>
        );
      case 'dispatch':
        return (
          <div className="pb-10">
            <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                <Send className="h-5 w-5" /> Configurações de Disparo
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Configure os parâmetros de disparo de mensagens em massa e prospecção.
              </p>
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-xl">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Delay mínimo entre disparos</p>
                  <p className="text-xs text-slate-500 mb-3">Configurado diretamente em cada campanha de disparo.</p>
                  <a href="/prospecting" className="text-sm text-blue-600 hover:underline">Gerenciar Prospecção →</a>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-xl">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Disparo em massa</p>
                  <p className="text-xs text-slate-500 mb-3">Configure e monitore seus disparos em massa.</p>
                  <a href="/dispatch" className="text-sm text-blue-600 hover:underline">Gerenciar Disparos →</a>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return <GeneralSettings hash={hash} isAdmin={profile?.role === 'admin'} />;
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex gap-6">
        {/* Sidebar vertical de configurações */}
        <div className="w-52 shrink-0">
          <nav className="sticky top-6 space-y-4">
            {sidebarGroups.map((group) => (
              <div key={group.label}>
                <p className="px-3 mb-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                          isActive
                            ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary-500' : ''}`} />
                        {item.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Conteúdo da aba ativa */}
        <div className="flex-1 min-w-0">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

