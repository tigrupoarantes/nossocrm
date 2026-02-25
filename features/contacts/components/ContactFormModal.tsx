import React, { useEffect, useId, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Contact } from '@/types';
import { DebugFillButton } from '@/components/debug/DebugFillButton';
import { fakeContact } from '@/lib/debug';
import { FocusTrap, useFocusReturn } from '@/lib/a11y';
import { useToast } from '@/context/ToastContext';

interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  role: string;
  companyName: string;
}

type RelationshipType = 'prospect' | 'customer' | 'inactive';

interface BusinessUnitOption {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface BuLinkState {
  businessUnitId: string;
  enabled: boolean;
  relationshipType: RelationshipType;
}

type Channel = 'email' | 'whatsapp';

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  formData: ContactFormData;
  setFormData: (data: ContactFormData) => void;
  editingContact: Contact | null;
  createFakeContactsBatch?: (count: number) => Promise<void>;
  isSubmitting?: boolean;
}

/**
 * Componente React `ContactFormModal`.
 *
 * @param {ContactFormModalProps} {
  isOpen,
  onClose,
  onSubmit,
  formData,
  setFormData,
  editingContact,
} - Parâmetro `{
  isOpen,
  onClose,
  onSubmit,
  formData,
  setFormData,
  editingContact,
}`.
 * @returns {Element | null} Retorna um valor do tipo `Element | null`.
 */
export const ContactFormModal: React.FC<ContactFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  formData,
  setFormData,
  editingContact,
  createFakeContactsBatch,
  isSubmitting = false,
}) => {
  const headingId = useId();
  useFocusReturn({ enabled: isOpen });
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const { addToast, showToast } = useToast();
  const toast = addToast || showToast;
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([]);
  const [buLinks, setBuLinks] = useState<Record<string, BuLinkState>>({});
  const [channelPrefs, setChannelPrefs] = useState<Record<string, boolean>>({});
  const [isLoadingBuData, setIsLoadingBuData] = useState(false);
  const [isSavingBuLinks, setIsSavingBuLinks] = useState(false);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  const selectedBusinessUnitIds = useMemo(
    () => Object.values(buLinks).filter((item) => item.enabled).map((item) => item.businessUnitId),
    [buLinks]
  );

  useEffect(() => {
    let active = true;

    const loadBuData = async () => {
      if (!isOpen || !editingContact?.id) {
        setBusinessUnits([]);
        setBuLinks({});
        setChannelPrefs({});
        return;
      }

      setIsLoadingBuData(true);
      try {
        const [linksRes, prefsRes] = await Promise.all([
          fetch(`/api/contacts/${editingContact.id}/business-units`, {
            method: 'GET',
            headers: { 'content-type': 'application/json' },
          }),
          fetch(`/api/contacts/${editingContact.id}/channel-preferences`, {
            method: 'GET',
            headers: { 'content-type': 'application/json' },
          }),
        ]);

        const linksJson = await linksRes.json().catch(() => ({}));
        const prefsJson = await prefsRes.json().catch(() => ({}));

        if (!linksRes.ok) {
          throw new Error(linksJson?.error || 'Erro ao carregar distribuidoras do contato');
        }
        if (!prefsRes.ok) {
          throw new Error(prefsJson?.error || 'Erro ao carregar preferências do contato');
        }

        const units: BusinessUnitOption[] = (linksJson?.data?.businessUnits ?? []).filter((u: any) => u?.isActive);
        const links: Array<{ businessUnitId: string; relationshipType: RelationshipType }> = linksJson?.data?.links ?? [];
        const preferences: Array<{ businessUnitId: string; channel: Channel; optIn: boolean }> = prefsJson?.data?.preferences ?? [];

        if (!active) return;

        setBusinessUnits(units);

        const linksMap: Record<string, BuLinkState> = {};
        for (const unit of units) {
          const existingLink = links.find((item) => item.businessUnitId === unit.id);
          linksMap[unit.id] = {
            businessUnitId: unit.id,
            enabled: Boolean(existingLink),
            relationshipType: existingLink?.relationshipType || 'prospect',
          };
        }
        setBuLinks(linksMap);

        const prefsMap: Record<string, boolean> = {};
        for (const pref of preferences) {
          prefsMap[`${pref.businessUnitId}:${pref.channel}`] = Boolean(pref.optIn);
        }
        setChannelPrefs(prefsMap);
      } catch (error) {
        toast?.((error as Error)?.message || 'Erro ao carregar dados de comunicação', 'error');
      } finally {
        if (active) setIsLoadingBuData(false);
      }
    };

    loadBuData();

    return () => {
      active = false;
    };
  }, [editingContact?.id, isOpen]);

  const fillWithFakeData = () => {
    const fake = fakeContact();
    setFormData({
      name: fake.name,
      email: fake.email,
      phone: fake.phone,
      role: fake.role,
      companyName: fake.companyName,
    });
  };

  const setLinkEnabled = (businessUnitId: string, enabled: boolean) => {
    setBuLinks(prev => ({
      ...prev,
      [businessUnitId]: {
        businessUnitId,
        enabled,
        relationshipType: prev[businessUnitId]?.relationshipType || 'prospect',
      },
    }));
  };

  const setRelationshipType = (businessUnitId: string, relationshipType: RelationshipType) => {
    setBuLinks(prev => ({
      ...prev,
      [businessUnitId]: {
        businessUnitId,
        enabled: prev[businessUnitId]?.enabled || false,
        relationshipType,
      },
    }));
  };

  const setChannelPreference = (businessUnitId: string, channel: Channel, optIn: boolean) => {
    setChannelPrefs(prev => ({
      ...prev,
      [`${businessUnitId}:${channel}`]: optIn,
    }));
  };

  const saveBusinessUnitLinks = async () => {
    if (!editingContact?.id) return;

    setIsSavingBuLinks(true);
    try {
      const links = Object.values(buLinks)
        .filter((item) => item.enabled)
        .map((item) => ({
          businessUnitId: item.businessUnitId,
          relationshipType: item.relationshipType,
        }));

      const response = await fetch(`/api/contacts/${editingContact.id}/business-units`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ links }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Erro ao salvar distribuidoras');
      }

      toast?.('Distribuidoras do contato salvas', 'success');
    } catch (error) {
      toast?.((error as Error)?.message || 'Erro ao salvar distribuidoras', 'error');
    } finally {
      setIsSavingBuLinks(false);
    }
  };

  const saveChannelPreferences = async () => {
    if (!editingContact?.id) return;

    setIsSavingPrefs(true);
    try {
      const preferences = selectedBusinessUnitIds.flatMap((businessUnitId) => (
        ['email', 'whatsapp'] as const
      ).map((channel) => ({
        businessUnitId,
        channel,
        optIn: channelPrefs[`${businessUnitId}:${channel}`] ?? true,
        source: 'manual',
      })));

      const response = await fetch(`/api/contacts/${editingContact.id}/channel-preferences`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preferences }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Erro ao salvar preferências de comunicação');
      }

      toast?.('Preferências de comunicação salvas', 'success');
    } catch (error) {
      toast?.((error as Error)?.message || 'Erro ao salvar preferências', 'error');
    } finally {
      setIsSavingPrefs(false);
    }
  };

  if (!isOpen) return null;

  return (
    <FocusTrap active={isOpen} onEscape={onClose}>
      <div 
        className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onClick={(e) => {
          // Close only when clicking the backdrop (outside the panel).
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl animate-in zoom-in-95 duration-200">
          <div className="p-5 border-b border-slate-200 dark:border-white/10 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h2 id={headingId} className="text-lg font-bold text-slate-900 dark:text-white font-display">
                {editingContact ? 'Editar Contato' : 'Novo Contato'}
              </h2>
              <DebugFillButton onClick={fillWithFakeData} />
              {createFakeContactsBatch && (
                <DebugFillButton
                  onClick={async () => {
                    setIsCreatingBatch(true);
                    try {
                      await createFakeContactsBatch(10);
                      onClose();
                    } finally {
                      setIsCreatingBatch(false);
                    }
                  }}
                  label={isCreatingBatch ? 'Criando...' : 'Fake x10'}
                  variant="secondary"
                  className="ml-1"
                  disabled={isCreatingBatch}
                />
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar modal"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white focus-visible-ring rounded"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        <form onSubmit={onSubmit} className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Nome Completo
                </label>
                <input
                  required
                  type="text"
                  className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ex: Ana Souza"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                <input
                  required
                  type="email"
                  className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="ana@empresa.com"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Telefone
                  </label>
                  <input
                    type="text"
                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="+5511999999999"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cargo</label>
                  <input
                    type="text"
                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Gerente"
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Empresa
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Nome da Empresa"
                  value={formData.companyName}
                  onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  {editingContact
                    ? 'Edite para alterar a empresa. Deixe em branco para desvincular.'
                    : 'Se a empresa já existir, o contato será vinculado a ela.'}
                </p>
              </div>
            </div>

            {editingContact && (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Distribuidoras (BUs)</h3>
                    <button
                      type="button"
                      onClick={saveBusinessUnitLinks}
                      disabled={isSavingBuLinks || isLoadingBuData}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50"
                    >
                      {isSavingBuLinks ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>

                  {isLoadingBuData ? (
                    <p className="text-xs text-slate-500">Carregando distribuidoras...</p>
                  ) : businessUnits.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhuma BU ativa cadastrada.</p>
                  ) : (
                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                      {businessUnits.map((unit) => {
                        const state = buLinks[unit.id] || {
                          businessUnitId: unit.id,
                          enabled: false,
                          relationshipType: 'prospect' as RelationshipType,
                        };

                        return (
                          <div key={unit.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2">
                            <div className="flex items-center justify-between gap-3">
                              <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                                <input
                                  type="checkbox"
                                  checked={state.enabled}
                                  onChange={(e) => setLinkEnabled(unit.id, e.target.checked)}
                                />
                                <span>{unit.name} <span className="text-slate-500">({unit.code})</span></span>
                              </label>

                              <select
                                value={state.relationshipType}
                                disabled={!state.enabled}
                                onChange={(e) => setRelationshipType(unit.id, e.target.value as RelationshipType)}
                                className="text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1"
                              >
                                <option value="prospect">prospect</option>
                                <option value="customer">customer</option>
                                <option value="inactive">inactive</option>
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Preferências de comunicação</h3>
                    <button
                      type="button"
                      onClick={saveChannelPreferences}
                      disabled={isSavingPrefs || isLoadingBuData || selectedBusinessUnitIds.length === 0}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50"
                    >
                      {isSavingPrefs ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>

                  {selectedBusinessUnitIds.length === 0 ? (
                    <p className="text-xs text-slate-500">Selecione pelo menos uma BU para definir opt-in por canal.</p>
                  ) : (
                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                      {selectedBusinessUnitIds.map((businessUnitId) => {
                        const unit = businessUnits.find((u) => u.id === businessUnitId);
                        if (!unit) return null;

                        const emailKey = `${businessUnitId}:email`;
                        const whatsappKey = `${businessUnitId}:whatsapp`;

                        return (
                          <div key={businessUnitId} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2">
                            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">{unit.name}</p>
                            <div className="flex items-center gap-4 text-sm">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={channelPrefs[emailKey] ?? true}
                                  onChange={(e) => setChannelPreference(businessUnitId, 'email', e.target.checked)}
                                />
                                <span>Email opt-in</span>
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={channelPrefs[whatsappKey] ?? true}
                                  onChange={(e) => setChannelPreference(businessUnitId, 'whatsapp', e.target.checked)}
                                />
                                <span>WhatsApp opt-in</span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary-600 hover:bg-primary-500 text-white font-bold py-2.5 rounded-lg mt-2 shadow-lg shadow-primary-600/20 transition-all"
          >
            {isSubmitting ? 'Salvando...' : (editingContact ? 'Salvar Contato' : 'Criar Contato')}
          </button>
        </form>
        </div>
      </div>
    </FocusTrap>
  );
};
