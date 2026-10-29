import { forwardRef, lazy, Suspense, type ComponentProps } from 'react';
import type { PubMapHandle } from './PubMap';

// MapLibre ist der größte Teil der App. Es lädt erst, wenn eine Karte sichtbar wird,
// damit Start- und Anmeldebildschirm sofort da sind.
const Inner = lazy(() => import('./PubMap').then((m) => ({ default: m.PubMap })));

export type { PubMapHandle };

export const PubMap = forwardRef<PubMapHandle, ComponentProps<typeof Inner>>(function LazyPubMap(props, ref) {
  return (
    <Suspense fallback={<div className="map-fallback" aria-hidden="true" />}>
      <Inner {...props} ref={ref} />
    </Suspense>
  );
});
