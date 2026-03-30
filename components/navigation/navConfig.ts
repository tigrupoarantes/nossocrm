import type { ComponentType } from 'react';
import {
  Inbox,
  KanbanSquare,
  Users,
  CheckSquare,
  MoreHorizontal,
  LayoutDashboard,
  BarChart3,
  Settings,
  User,
  Bot,
  Search,
  Megaphone,
  MessageSquare,
  Link2,
  BookOpen,
  GraduationCap,
} from 'lucide-react';

export type PrimaryNavId = 'inbox' | 'boards' | 'contacts' | 'activities' | 'conversations' | 'more';

export interface PrimaryNavItem {
  id: PrimaryNavId;
  label: string;
  /** Route to navigate. For "more", this is omitted because it opens a menu/sheet. */
  href?: string;
  icon: ComponentType<{ className?: string }>;
}

export const PRIMARY_NAV: PrimaryNavItem[] = [
  { id: 'inbox', label: 'Inbox', href: '/inbox', icon: Inbox },
  { id: 'conversations', label: 'Conversas', href: '/conversations', icon: MessageSquare },
  { id: 'boards', label: 'CRM', href: '/boards', icon: KanbanSquare },
  { id: 'contacts', label: 'Contatos', href: '/contacts', icon: Users },
  { id: 'activities', label: 'Atividades', href: '/activities', icon: CheckSquare },
  { id: 'more', label: 'Mais', icon: MoreHorizontal },
];

export type SecondaryNavId =
  | 'dashboard'
  | 'reports'
  | 'settings'
  | 'profile'
  | 'super-agent'
  | 'prospecting'
  | 'ads'
  | 'connections'
  | 'help'
  | 'onboarding';

export interface SecondaryNavItem {
  id: SecondaryNavId;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  group?: 'main' | 'sales' | 'ai' | 'system';
}

/** Mirrors non-primary destinations available in the desktop sidebar/user menu. */
export const SECONDARY_NAV: SecondaryNavItem[] = [
  // Principal
  { id: 'dashboard', label: 'Visão Geral', href: '/dashboard', icon: LayoutDashboard, group: 'main' },
  { id: 'reports', label: 'Relatórios', href: '/reports', icon: BarChart3, group: 'main' },
  // Vendas
  { id: 'prospecting', label: 'Prospectar', href: '/prospecting', icon: Search, group: 'sales' },
  { id: 'ads', label: 'Anúncios', href: '/ads', icon: Megaphone, group: 'sales' },
  // IA
  { id: 'super-agent', label: 'Super Agente', href: '/super-agent', icon: Bot, group: 'ai' },
  // Sistema
  { id: 'connections', label: 'Conexões', href: '/connections', icon: Link2, group: 'system' },
  { id: 'settings', label: 'Configurações', href: '/settings', icon: Settings, group: 'system' },
  { id: 'help', label: 'Ajuda', href: '/help', icon: BookOpen, group: 'system' },
  { id: 'onboarding', label: 'Tutoriais', href: '/onboarding', icon: GraduationCap, group: 'system' },
  { id: 'profile', label: 'Perfil', href: '/profile', icon: User, group: 'system' },
];
