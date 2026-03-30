/**
 * lib/prospecting/sources/csv-import.ts
 * Importação de listas de leads a partir de CSV.
 */

export interface CSVLead {
  businessName: string
  phone: string | null
  email: string | null
  address: string | null
  segment: string | null
  city: string | null
  source: 'csv_import'
}

/**
 * Parseia CSV de leads.
 * Colunas esperadas (case-insensitive, qualquer ordem):
 *   nome/name/empresa, telefone/phone, email, endereco/address, segmento/segment, cidade/city
 */
export function parseLeadsCSV(csvText: string): CSVLead[] {
  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  // Detectar header
  const rawHeaders = lines[0].split(/[,;|\t]/).map((h) => h.trim().toLowerCase())

  const colMap = {
    businessName: rawHeaders.findIndex((h) => ['nome', 'name', 'empresa', 'business', 'razao_social', 'razão_social'].includes(h)),
    phone: rawHeaders.findIndex((h) => ['telefone', 'phone', 'tel', 'celular', 'whatsapp', 'fone'].includes(h)),
    email: rawHeaders.findIndex((h) => ['email', 'e-mail', 'email_address'].includes(h)),
    address: rawHeaders.findIndex((h) => ['endereco', 'endereço', 'address', 'logradouro'].includes(h)),
    segment: rawHeaders.findIndex((h) => ['segmento', 'segment', 'setor', 'ramo', 'categoria'].includes(h)),
    city: rawHeaders.findIndex((h) => ['cidade', 'city', 'municipio', 'município'].includes(h)),
  }

  const separator = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : lines[0].includes('|') ? '|' : ','

  const leads: CSVLead[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(separator).map((c) => c.trim().replace(/^["']|["']$/g, ''))
    if (cols.every((c) => !c)) continue

    const get = (idx: number) => (idx >= 0 ? cols[idx] || null : null)

    leads.push({
      businessName: get(colMap.businessName) ?? `Lead ${i}`,
      phone: normalizePhone(get(colMap.phone)),
      email: get(colMap.email),
      address: get(colMap.address),
      segment: get(colMap.segment),
      city: get(colMap.city),
      source: 'csv_import',
    })
  }

  return leads
}

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 8) return null
  // Adicionar +55 se número brasileiro sem código de país
  if (digits.length <= 11 && !raw.startsWith('+')) {
    return `+55${digits}`
  }
  if (!raw.startsWith('+')) return `+${digits}`
  return raw
}
