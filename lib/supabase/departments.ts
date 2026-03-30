import { supabase } from './client';
import { sanitizeUUID, sanitizeText } from './utils';

// ============================================
// DEPARTMENTS SERVICE
// ============================================

export interface Department {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  color: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DbDepartment {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function toDepartment(db: DbDepartment): Department {
  return {
    id: db.id,
    organizationId: db.organization_id,
    name: db.name,
    description: db.description,
    color: db.color,
    isActive: db.is_active,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

/**
 * Lista departamentos da organização.
 */
export async function getDepartments(organizationId: string): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('organization_id', sanitizeUUID(organizationId))
    .order('name');

  if (error || !data) return [];
  return data.map(toDepartment);
}

/**
 * Busca departamento por ID.
 */
export async function getDepartment(id: string): Promise<Department | null> {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('id', sanitizeUUID(id))
    .single();

  if (error || !data) return null;
  return toDepartment(data);
}

/**
 * Cria um novo departamento.
 */
export async function createDepartment(
  organizationId: string,
  input: { name: string; description?: string; color?: string }
): Promise<Department | null> {
  const { data, error } = await supabase
    .from('departments')
    .insert({
      organization_id: sanitizeUUID(organizationId),
      name: sanitizeText(input.name),
      description: input.description ? sanitizeText(input.description) : null,
      color: input.color || '#3b82f6',
    })
    .select()
    .single();

  if (error || !data) return null;
  return toDepartment(data);
}

/**
 * Atualiza um departamento.
 */
export async function updateDepartment(
  id: string,
  input: Partial<{ name: string; description: string; color: string; isActive: boolean }>
): Promise<Department | null> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.name !== undefined) update.name = sanitizeText(input.name);
  if (input.description !== undefined) update.description = sanitizeText(input.description);
  if (input.color !== undefined) update.color = input.color;
  if (input.isActive !== undefined) update.is_active = input.isActive;

  const { data, error } = await supabase
    .from('departments')
    .update(update)
    .eq('id', sanitizeUUID(id))
    .select()
    .single();

  if (error || !data) return null;
  return toDepartment(data);
}

/**
 * Deleta um departamento.
 */
export async function deleteDepartment(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('departments')
    .delete()
    .eq('id', sanitizeUUID(id));

  return !error;
}
