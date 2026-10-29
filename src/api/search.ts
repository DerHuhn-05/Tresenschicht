import type { PubFeature, PubSearch } from './types';

/** Kategorie in Arten und Ausstattung übersetzen (wie search_pubs auf dem Server sie erwartet) */
export function searchFilter({ features = [], category }: PubSearch) {
  if (category === 'raucherkneipe') return { features: [...features, 'smoking' as PubFeature], types: ['kneipe', 'bar'] };
  return { features, types: category ? [category] : [] };
}
