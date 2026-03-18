/**
 * Gera um slug URL-safe a partir de um título.
 * Ex.: "Minha Landing Page!" → "minha-landing-page"
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s-]/g, '')    // remove caracteres especiais
    .trim()
    .replace(/\s+/g, '-')            // espaços → hífens
    .replace(/-+/g, '-')             // múltiplos hífens → um
    .substring(0, 80);               // max 80 chars
}

/**
 * Garante unicidade do slug adicionando sufixo numérico se necessário.
 * Deve ser combinado com validação no banco.
 */
export function uniquifySlug(slug: string, existingSlugs: string[]): string {
  if (!existingSlugs.includes(slug)) return slug;
  let counter = 2;
  while (existingSlugs.includes(`${slug}-${counter}`)) {
    counter++;
  }
  return `${slug}-${counter}`;
}
