'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCreateDeal } from '@/lib/query/hooks/useDealsQuery';
import { useCreateContact } from '@/lib/query/hooks/useContactsQuery';
import {
  conversationKeys,
  type ConversationWithContact,
} from '@/lib/query/hooks/useConversationsQuery';
import { DEALS_VIEW_KEY, queryKeys } from '@/lib/query';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/context/ToastContext';
import { normalizePhoneE164 } from '@/lib/phone';
import type { Board, Contact, DealView } from '@/types';
import { ContactStage } from '@/types';

interface SendArgs {
  conversation: ConversationWithContact;
  board: Board;
}

interface SendResult {
  ok: boolean;
  dealId?: string;
  existing?: boolean;
}

function deriveContactInfo(conversation: ConversationWithContact) {
  const rawPhone =
    conversation.contacts?.phone ??
    conversation.wa_chat_id?.replace('@c.us', '') ??
    '';
  const phone = normalizePhoneE164(rawPhone);
  const name =
    conversation.contacts?.name?.trim() ||
    phone ||
    conversation.wa_chat_id ||
    'Novo contato';
  return { phone, name };
}

export function useSendConversationToBoard() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const createContact = useCreateContact();
  const createDeal = useCreateDeal();

  async function send({ conversation, board }: SendArgs): Promise<SendResult> {
    if (!board.stages?.length) {
      addToast('Funil sem estágios configurados.', 'error');
      return { ok: false };
    }

    let contactId = conversation.contact_id;
    let contactName = conversation.contacts?.name ?? '';

    if (!contactId) {
      const { name, phone } = deriveContactInfo(conversation);
      try {
        const payload: Omit<Contact, 'id' | 'createdAt'> = {
          name,
          email: '',
          phone,
          role: '',
          companyId: '',
          status: 'ACTIVE',
          stage: ContactStage.LEAD,
          totalValue: 0,
          source: `Omnichannel - ${conversation.channel}`,
        } as Omit<Contact, 'id' | 'createdAt'>;
        const created = await createContact.mutateAsync(payload);
        contactId = created.id;
        contactName = created.name;
      } catch (err) {
        addToast(`Erro ao criar contato: ${(err as Error).message}`, 'error');
        return { ok: false };
      }
    }

    if (!contactName) contactName = 'Contato';

    const cachedDeals = queryClient.getQueryData<DealView[]>(DEALS_VIEW_KEY) ?? [];
    const existing = cachedDeals.find(
      (d) =>
        d.contactId === contactId &&
        d.boardId === board.id &&
        !d.isWon &&
        !d.isLost,
    );
    if (existing) {
      addToast(`Contato já está no funil "${board.name}".`, 'info');
      return { ok: true, dealId: existing.id, existing: true };
    }

    const firstStage = board.stages[0];
    let newDealId: string;
    try {
      const deal = await createDeal.mutateAsync({
        title: `Deal - ${contactName}`,
        contactId: contactId!,
        boardId: board.id,
        status: firstStage.id,
        value: 0,
        probability: 0,
        priority: 'medium',
        tags: [],
        items: [],
        customFields: {},
        owner: { name: 'Eu', avatar: '' },
        isWon: false,
        isLost: false,
      });
      newDealId = deal.id;
    } catch (err) {
      addToast(`Erro ao criar card: ${(err as Error).message}`, 'error');
      return { ok: false };
    }

    if (supabase) {
      const updates: Record<string, unknown> = { deal_id: newDealId };
      if (!conversation.contact_id && contactId) updates.contact_id = contactId;
      const { error } = await supabase
        .from('conversations')
        .update(updates)
        .eq('id', conversation.id);
      if (error) {
        console.warn('[sendToBoard] falha ao vincular conversa ao deal', error);
      }
    }

    queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
    queryClient.invalidateQueries({ queryKey: queryKeys.boards.all });

    addToast(`Card criado no funil "${board.name}".`, 'success');
    return { ok: true, dealId: newDealId };
  }

  return {
    send,
    isPending: createContact.isPending || createDeal.isPending,
  };
}
