/**
 * Unified hook for moving deals between stages
 *
 * This is the SINGLE SOURCE OF TRUTH for deal movement logic.
 * Use this hook everywhere instead of calling updateDeal/updateDealStatus directly.
 *
 * Features:
 * - Detects won/lost stages via linkedLifecycleStage
 * - Creates activity history entries
 * - Updates contact lifecycle stage (LinkedStage automation)
 * - Creates deal in next board (NextBoard automation)
 * - Optimistic updates for instant UI feedback
 * - Refetch+toast quando automacao move o card para outro stage
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, DEALS_VIEW_KEY } from '../queryKeys';
import { dealsService } from '@/lib/supabase';
import { boardsService } from '@/lib/supabase/boards';
import { activitiesService } from '@/lib/supabase/activities';
import { contactsService } from '@/lib/supabase/contacts';
import { onStageEntered } from '@/lib/automation/triggers';
import { useOptionalToast } from '@/context/ToastContext';
import type { Deal, DealView, Board, Activity } from '@/types';

interface MoveDealParams {
  dealId: string;
  targetStageId: string;
  lossReason?: string;
  // Context needed for automations
  deal: Deal | DealView;
  board: Board;
  lifecycleStages?: { id: string; name: string }[];
  explicitWin?: boolean;
  explicitLost?: boolean;
}

interface MoveDealResult {
  dealId: string;
  newStatus: string;
  isWon?: boolean;
  isLost?: boolean;
}

// Context type for optimistic updates
interface MoveDealContext {
  previousDeals: DealView[] | undefined;
  /** Stage destino escolhido pelo usuario — usado pra detectar move_stage automatico */
  intendedStageId: string;
  /** Board atual — usado pra resolver nome do stage final no toast */
  board: Board;
}

/**
 * Hook React `useMoveDeal` que encapsula uma lógica reutilizável.
 */
export const useMoveDeal = () => {
  const queryClient = useQueryClient();
  const { showToast } = useOptionalToast();

  return useMutation<MoveDealResult, Error, MoveDealParams, MoveDealContext>({
    mutationFn: async ({ dealId, targetStageId, lossReason, deal, board, lifecycleStages, explicitWin, explicitLost }) => {
      const targetStage = board.stages.find(s => s.id === targetStageId);

      // Determine isWon/isLost based on params OR linkedLifecycleStage
      let isWon: boolean | undefined;
      let isLost: boolean | undefined;
      let closedAt: string | null | undefined;

      if (explicitWin) {
        isWon = true;
        isLost = false;
        closedAt = new Date().toISOString();
      } else if (explicitLost) {
        isLost = true;
        isWon = false;
        closedAt = new Date().toISOString();
      } else if (
        // Prefer explicit won/lost stages when configured on the board.
        // Fallback to lifecycle hints ONLY when the board doesn't define won/lost IDs.
        (
          board.wonStageId
            ? targetStageId === board.wonStageId
            : (board.linkedLifecycleStage !== 'CUSTOMER' && targetStage?.linkedLifecycleStage === 'CUSTOMER')
        )
      ) {
        isWon = true;
        isLost = false;
        closedAt = new Date().toISOString();
      } else if (
        (board.lostStageId ? targetStageId === board.lostStageId : targetStage?.linkedLifecycleStage === 'OTHER')
      ) {
        isLost = true;
        isWon = false;
        closedAt = new Date().toISOString();
      } else {
        // Moving to a regular stage - reopen if was closed
        if (deal.isWon || deal.isLost) {
          isWon = false;
          isLost = false;
          closedAt = null;
        }
      }

      // Build updates object
      const updates: Partial<Deal> = {
        status: targetStageId,
        lastStageChangeDate: new Date().toISOString(),
        ...(lossReason && { lossReason }),
        ...(isWon !== undefined && { isWon }),
        ...(isLost !== undefined && { isLost }),
        ...(closedAt !== undefined && { closedAt: closedAt as string }),
      };

      // 1. Update the deal
      const { error: dealError } = await dealsService.update(dealId, updates);
      if (dealError) {
        throw dealError;
      }

      // 2. Create activity "Moveu para X" (fire and forget - don't block UI)
      const stageLabel = targetStage?.label || targetStageId;
      activitiesService.create({
        dealId,
        dealTitle: deal.title,
        type: 'STATUS_CHANGE',
        title: `Moveu para ${stageLabel}`,
        description: lossReason ? `Motivo da perda: ${lossReason}` : undefined,
        date: new Date().toISOString(),
        completed: true,
        user: { name: 'Sistema', avatar: '' },
      } as Omit<Activity, 'id' | 'createdAt'>).catch(console.error);

      // 3. LinkedStage: Update contact stage when moving to linked column
      if (targetStage?.linkedLifecycleStage && deal.contactId) {
        const lifecycleStageName =
          lifecycleStages?.find(ls => ls.id === targetStage.linkedLifecycleStage)?.name ||
          targetStage.linkedLifecycleStage;

        contactsService.update(deal.contactId, {
          stage: targetStage.linkedLifecycleStage
        }).catch(console.error);

        activitiesService.create({
          dealId,
          dealTitle: deal.title,
          type: 'STATUS_CHANGE',
          title: `Contato promovido para ${lifecycleStageName}`,
          description: `Automático via LinkedStage da etapa "${targetStage.label}"`,
          date: new Date().toISOString(),
          completed: true,
          user: { name: 'Sistema', avatar: '' },
        } as Omit<Activity, 'id' | 'createdAt'>).catch(console.error);
      }

      // 4. Automation Engine: trigger stage_entered (fire-and-forget)
      // O trigger ja dispara o endpoint run-now internamente — automacao
      // roda em < 2s sem esperar o cron de 15min.
      if (deal.boardId) {
        onStageEntered({
          dealId,
          boardId: deal.boardId,
          stageId: targetStageId,
          organizationId: (deal as { organizationId?: string; organization_id?: string }).organizationId
            ?? (deal as { organizationId?: string; organization_id?: string }).organization_id
            ?? '',
        }).catch(console.error);
      }

      // 5. NextBoard Automation (async, don't block)
      const isSuccessStage =
        isWon ||
        targetStage?.linkedLifecycleStage === 'MQL' ||
        targetStage?.linkedLifecycleStage === 'SALES_QUALIFIED';

      if (isSuccessStage && board.nextBoardId) {
        (async () => {
          try {
            const targetBoard = await boardsService.get(board.nextBoardId!);
            if (targetBoard && targetBoard.stages.length > 0) {
              const entryStageId = targetBoard.stages[0].id;

              const { error: copyError } = await dealsService.create({
                title: deal.title,
                value: deal.value,
                contactId: deal.contactId,
                boardId: targetBoard.id,
                // Status/stage devem refletir o board de destino (não o stage do board anterior)
                status: entryStageId,
                priority: deal.priority,
                // Compat: DealView/Deal ainda pode ter companyId legado
                clientCompanyId: deal.clientCompanyId ?? deal.companyId,
                ownerId: deal.ownerId,
                owner: deal.owner || { name: 'Unknown', avatar: '' },
                items: deal.items || [],
                tags: deal.tags || [],
                // Rastreabilidade (ajuda também a prevenir duplicidade no futuro)
                customFields: {
                  originDealId: deal.id,
                  originBoardId: board.id,
                  originAutomation: 'NEXT_BOARD',
                },
                updatedAt: new Date().toISOString(),
                isWon: false,
                isLost: false,
                probability: 0,
              });

              if (!copyError) {
                await activitiesService.create({
                  dealId,
                  dealTitle: deal.title,
                  type: 'STATUS_CHANGE',
                  title: `Enviado para ${targetBoard.name}`,
                  description: `Automação: Ao ganhar neste board, criou carta em "${targetBoard.name}"`,
                  date: new Date().toISOString(),
                  completed: true,
                  user: { name: 'Sistema', avatar: '' },
                } as Omit<Activity, 'id' | 'createdAt'>);
              }
            }
          } catch (err) {
            console.error('[Automation] Failed to move to next board:', err);
          }
        })();
      }

      return { dealId, newStatus: targetStageId, isWon, isLost };
    },

    // Optimistic update: update UI instantly before server responds
    onMutate: async ({ dealId, targetStageId, deal, explicitWin, explicitLost, board }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.deals.all });

      // Snapshot previous state - usa DEALS_VIEW_KEY (única fonte de verdade)
      const previousDeals = queryClient.getQueryData<DealView[]>(DEALS_VIEW_KEY);

      // Determine new status
      const targetStage = board.stages.find(s => s.id === targetStageId);
      const isWon =
        explicitWin
        || (
          board.wonStageId
            ? targetStageId === board.wonStageId
            : (board.linkedLifecycleStage !== 'CUSTOMER' && targetStage?.linkedLifecycleStage === 'CUSTOMER')
        );
      const isLost =
        explicitLost
        || (board.lostStageId ? targetStageId === board.lostStageId : targetStage?.linkedLifecycleStage === 'OTHER');

      // Optimistically update APENAS DEALS_VIEW_KEY (única fonte de verdade)
      queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, (old) => {
        if (!old) return old;
        return old.map(d => {
          if (d.id === dealId) {
            return {
              ...d,
              status: targetStageId,
              lastStageChangeDate: new Date().toISOString(),
              isWon: isWon ?? d.isWon,
              isLost: isLost ?? d.isLost,
              updatedAt: new Date().toISOString(),
            };
          }
          return d;
        });
      });

      // Também atualizar o detail cache se existir
      queryClient.setQueryData<Deal>(queryKeys.deals.detail(dealId), (old) => {
        if (!old) return old;
        return {
          ...old,
          status: targetStageId,
          lastStageChangeDate: new Date().toISOString(),
          isWon: isWon ?? old.isWon,
          isLost: isLost ?? old.isLost,
          updatedAt: new Date().toISOString(),
        };
      });

      return { previousDeals, intendedStageId: targetStageId, board };
    },

    // Rollback on error
    onError: (_err, _variables, context) => {
      if (context?.previousDeals) {
        queryClient.setQueryData(DEALS_VIEW_KEY, context.previousDeals);
      }
    },

    // Apos sucesso: agenda refetch em 3s pra capturar moves automaticos
    // feitos pela regra (action_type=move_stage). Se o stage final no banco
    // diferir do que o usuario soltou, mostra toast explicando a automacao.
    onSuccess: (_data, _variables, context) => {
      if (!context) return;
      const { intendedStageId, board } = context;

      setTimeout(async () => {
        await queryClient.invalidateQueries({ queryKey: DEALS_VIEW_KEY });
        // Le do cache pos-refetch
        const fresh = queryClient.getQueryData<DealView[]>(DEALS_VIEW_KEY);
        const updated = fresh?.find(d => d.id === _data.dealId);
        if (!updated) return;
        if (updated.status && updated.status !== intendedStageId) {
          const finalStage = board.stages.find(s => s.id === updated.status);
          const finalLabel = finalStage?.label ?? 'outra etapa';
          showToast(`Automação aplicada — card movido para "${finalLabel}"`, 'info');
        }
      }, 3000);
    },

    // NOTE: We DON'T invalidate in onSettled to avoid race condition with Realtime.
    // The setTimeout above (3s) handles the automation-induced move case.
  });
};

/**
 * Hook React `useMoveDealSimple` que encapsula uma lógica reutilizável.
 */
export const useMoveDealSimple = (
  board: Board | null,
  lifecycleStages?: { id: string; name: string }[]
) => {
  const moveDealMutation = useMoveDeal();

  const moveDeal = async (
    deal: Deal | DealView,
    targetStageId: string,
    lossReason?: string,
    explicitWin?: boolean,
    explicitLost?: boolean
  ) => {
    if (!board) {
      console.error('[useMoveDealSimple] No board provided');
      return;
    }

    return moveDealMutation.mutateAsync({
      dealId: deal.id,
      targetStageId,
      lossReason,
      deal,
      board,
      lifecycleStages,
      explicitWin,
      explicitLost,
    });
  };

  return {
    moveDeal,
    isMoving: moveDealMutation.isPending,
    error: moveDealMutation.error,
  };
};
