import { useEffect, useRef, useState } from 'react';
import { errorText, PAGE_SIZE, type Filter, type GalleryApi, type Listing } from './model';

export type Direction = -1 | 1;
export type GallerySequence = { filter: Filter; listing: Listing };
type List = GalleryApi['list'];

export function sequencePosition(sequence: GallerySequence | null, id: string) {
  const index = sequence?.listing.figures.findIndex(figure => figure.id === id) ?? -1;
  return sequence && index >= 0 ? sequence.filter.offset + index : -1;
}

export async function findGallerySequence(list: List, id: string, signal: AbortSignal) {
  const filter: Filter = { scope: 'gallery', sort: 'latest', category: '', query: '', profile: '', offset: 0 };
  for (let offset = 0; !signal.aborted; offset += PAGE_SIZE) {
    const page = { ...filter, offset };
    const listing = await list(page, signal);
    if (listing.figures.some(figure => figure.id === id)) return { filter: page, listing };
    if (offset + PAGE_SIZE >= listing.total || !listing.figures.length) break;
  }
  return null;
}

export function useGalleryStep(
  list: List, sequence: GallerySequence | null, id: string,
  select: (id: string, page: GallerySequence, keepLarge?: boolean) => void,
) {
  const request = useRef<AbortController | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const position = sequencePosition(sequence, id);
  const total = sequence?.listing.total ?? 0;

  useEffect(() => {
    setError('');
    setLoading(false);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [list, id]);
  async function step(delta: Direction, keepLarge?: boolean) {
    const next = position + delta;
    if (!sequence || position < 0 || next < 0 || next >= total || request.current) return;
    setError('');
    const pageOffset = Math.floor(next / PAGE_SIZE) * PAGE_SIZE;
    if (pageOffset === sequence.filter.offset) {
      const figure = sequence.listing.figures[next - pageOffset];
      if (figure) select(figure.id, sequence, keepLarge);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const filter = { ...sequence.filter, offset: pageOffset };
      const listing = await list(filter, controller.signal);
      const figure = listing.figures[next - pageOffset];
      if (!controller.signal.aborted && figure) select(figure.id, { filter, listing }, keepLarge);
    } catch (error) {
      if (!controller.signal.aborted) setError(errorText(error));
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }

  return { position, total, previous: position > 0, next: position >= 0 && position + 1 < total, step, loading, error };
}

export type GalleryNavigation = ReturnType<typeof useGalleryStep>;

export function useArrowNavigation(onStep?: (delta: Direction) => void) {
  useEffect(() => {
    if (!onStep) return;
    const navigate = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
      const editable = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"]';
      if (event.target instanceof Element && event.target.closest(editable)) return;
      if (document.activeElement instanceof Element && document.activeElement.closest(editable)) return;
      event.preventDefault();
      onStep(event.key === 'ArrowLeft' ? -1 : 1);
    };
    document.addEventListener('keydown', navigate);
    return () => document.removeEventListener('keydown', navigate);
  }, [onStep]);
}
