'use client';

import { useEffect, useState } from 'react';
import { ArrowRightCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { Board } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  boards: Board[];
  onConfirm: (board: Board) => void;
  isPending: boolean;
}

export function SendToBoardModal({ isOpen, onClose, boards, onConfirm, isPending }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const defaultBoard = boards.find((b) => b.isDefault) ?? boards[0];
      setSelectedId(defaultBoard?.id ?? null);
    }
  }, [isOpen, boards]);

  const selected = boards.find((b) => b.id === selectedId) ?? null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Enviar para funil" size="md">
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Escolha o funil onde o card deste contato será criado.
        </p>

        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
          {boards.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
              Nenhum funil disponível. Crie um board primeiro.
            </p>
          )}
          {boards.map((board) => {
            const isActive = board.id === selectedId;
            const firstStage = board.stages?.[0];
            return (
              <button
                key={board.id}
                type="button"
                onClick={() => setSelectedId(board.id)}
                disabled={isPending}
                className={`w-full text-left p-3 rounded-lg border transition-colors disabled:opacity-60 ${
                  isActive
                    ? 'border-primary-500 bg-primary-500/5'
                    : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white text-sm truncate">
                      {board.name}
                    </p>
                    {firstStage && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Entra no estágio:{' '}
                        <span className="font-medium">{firstStage.label}</span>
                      </p>
                    )}
                  </div>
                  {board.isDefault && (
                    <span className="shrink-0 text-[10px] font-medium text-primary-600 dark:text-primary-400 bg-primary-500/10 px-2 py-0.5 rounded">
                      Padrão
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected || isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            <ArrowRightCircle size={14} />
            {isPending ? 'Enviando...' : 'Enviar para funil'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
