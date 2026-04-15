/**
 * lib/prospecting/sources/google-places.ts
 * Busca estabelecimentos via Google Places API (Text Search).
 */

export interface PlacesResult {
  businessName: string
  phone: string | null
  address: string | null
  rating: number | null
  placeId: string
  source: 'google_places'
}

export interface PlacesSearchParams {
  segment: string
  city: string
  maxResults?: number
}

/**
 * Busca lugares pelo Google Places Text Search API.
 * Requer GOOGLE_PLACES_API_KEY no ambiente.
 */
export async function searchGooglePlaces(params: PlacesSearchParams): Promise<PlacesResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    console.warn('[GooglePlaces] GOOGLE_PLACES_API_KEY não configurada')
    return []
  }

  const query = `${params.segment} em ${params.city}`
  const maxResults = params.maxResults ?? 20

  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
  url.searchParams.set('query', query)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('language', 'pt-BR')
  url.searchParams.set('region', 'br')

  const results: PlacesResult[] = []
  let nextPageToken: string | undefined

  do {
    if (nextPageToken) {
      url.searchParams.set('pagetoken', nextPageToken)
      // Google exige delay antes de usar pagetoken
      await new Promise((r) => setTimeout(r, 2000))
    }

    const res = await fetch(url.toString())
    if (!res.ok) break

    const data = await res.json() as {
      status: string
      results: Array<{
        name: string
        formatted_address: string
        rating: number
        place_id: string
        formatted_phone_number?: string
        international_phone_number?: string
      }>
      next_page_token?: string
    }

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') break

    for (const place of data.results ?? []) {
      results.push({
        businessName: place.name,
        // Text Search raramente retorna telefone — enriquecemos com Place
        // Details logo abaixo usando o `placeId`. Mantemos aqui o fallback
        // caso algum provedor devolva direto.
        phone: place.international_phone_number ?? place.formatted_phone_number ?? null,
        address: place.formatted_address ?? null,
        rating: place.rating ?? null,
        placeId: place.place_id,
        source: 'google_places',
      })
      if (results.length >= maxResults) break
    }

    nextPageToken = data.next_page_token
  } while (nextPageToken && results.length < maxResults)

  // Enriquecimento: Text Search não traz telefone por padrão. Fazemos uma
  // chamada Place Details por resultado em paralelo (Promise.allSettled
  // tolera falhas individuais sem abortar a busca inteira).
  const enriched = await Promise.allSettled(
    results.map(async (r) => {
      if (r.phone) return r
      const details = await getPlaceDetails(r.placeId)
      return { ...r, phone: details.phone }
    })
  )

  return enriched.map((e, i) =>
    e.status === 'fulfilled' ? e.value : results[i]
  )
}

/**
 * Busca detalhes de um lugar específico (para obter telefone).
 */
export async function getPlaceDetails(placeId: string): Promise<{ phone: string | null }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return { phone: null }

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('fields', 'international_phone_number,formatted_phone_number')
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString())
  if (!res.ok) return { phone: null }

  const data = await res.json() as {
    result?: { international_phone_number?: string; formatted_phone_number?: string }
  }

  return {
    phone: data.result?.international_phone_number ?? data.result?.formatted_phone_number ?? null,
  }
}
