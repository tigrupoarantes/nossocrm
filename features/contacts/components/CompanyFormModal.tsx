import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { CRMCompany } from '@/types';
import { Modal, ModalForm } from '@/components/ui/Modal';
import { InputField, SubmitButton } from '@/components/ui/FormField';
import { companyFormSchema } from '@/lib/validations/schemas';
import type { CompanyFormData } from '@/lib/validations/schemas';
import { formatCNPJMask } from '@/lib/integrations/cnpj';

type CompanyFormInput = z.input<typeof companyFormSchema>;

interface CompanyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CompanyFormData) => void;
  editingCompany: CRMCompany | null;
}

/**
 * Componente React `CompanyFormModal`.
 *
 * @param {CompanyFormModalProps} {
  isOpen,
  onClose,
  onSubmit,
  editingCompany,
} - Parâmetro `{
  isOpen,
  onClose,
  onSubmit,
  editingCompany,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const CompanyFormModal: React.FC<CompanyFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editingCompany,
}) => {
  const form = useForm<CompanyFormInput>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      name: editingCompany?.name || '',
      industry: editingCompany?.industry || '',
      website: editingCompany?.website || '',
      cnpj: formatCNPJMask(editingCompany?.cnpj || ''),
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = form;

  const cnpjValue = watch('cnpj');

  React.useEffect(() => {
    if (isOpen) {
      reset({
        name: editingCompany?.name || '',
        industry: editingCompany?.industry || '',
        website: editingCompany?.website || '',
        cnpj: formatCNPJMask(editingCompany?.cnpj || ''),
      });
    }
  }, [isOpen, editingCompany, reset]);

  const handleFormSubmit = (data: CompanyFormInput) => {
    const parsed = companyFormSchema.parse(data);
    onSubmit(parsed);
    onClose();
    reset();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingCompany ? 'Editar Empresa' : 'Nova Empresa'}
    >
      <ModalForm onSubmit={handleSubmit(handleFormSubmit)}>
        <InputField
          label="Nome"
          placeholder="Ex: NossoCRM LTDA"
          required
          error={errors.name}
          registration={register('name')}
        />

        <InputField
          label="CNPJ"
          placeholder="00.000.000/0000-00"
          hint="Apenas dígitos; a formatação é aplicada automaticamente."
          error={errors.cnpj}
          value={cnpjValue ?? ''}
          onChange={e => setValue('cnpj', formatCNPJMask(e.target.value), { shouldValidate: true })}
          inputMode="numeric"
          maxLength={18}
        />

        <InputField
          label="Setor"
          placeholder="Ex: SaaS"
          error={errors.industry}
          registration={register('industry')}
        />

        <InputField
          label="Website"
          placeholder="empresa.com"
          hint="Sem http(s) (vamos normalizar automaticamente)."
          error={errors.website}
          registration={register('website')}
        />

        <SubmitButton isLoading={isSubmitting}>
          {editingCompany ? 'Salvar Alterações' : 'Criar Empresa'}
        </SubmitButton>
      </ModalForm>
    </Modal>
  );
};

