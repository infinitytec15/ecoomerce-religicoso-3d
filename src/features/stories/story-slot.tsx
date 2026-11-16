import { storiesFor, type StoryHighlightPublic, type StoryWhere } from '@maos-em-oracao/contracts';
import { StoriesRow } from './stories-row';
import { StoryCarousel } from './story-carousel';

/** Collections of one place split by format: every bubble collection, then each carousel. */
export function slotGroups(collections: StoryHighlightPublic[], where: StoryWhere) {
  const placed = storiesFor(collections, where);
  return {
    bubbles: placed.filter((h) => h.format === 'stories'),
    carousels: placed.filter((h) => h.format === 'carousel'),
  };
}

/**
 * The videos of one place of the store: the "stories" collections share one row of bubbles, followed
 * by one carousel per "carousel" collection, in the order received. Nothing when the place is empty.
 */
export function StorySlot({
  collections,
  where,
  className = '',
}: {
  collections: StoryHighlightPublic[];
  where: StoryWhere;
  className?: string;
}) {
  const { bubbles, carousels } = slotGroups(collections, where);
  if (!bubbles.length && !carousels.length) return null;
  return (
    <div className={`story-slot ${className}`.trim()} data-place={where.place}>
      <StoriesRow highlights={bubbles} />
      {carousels.map((highlight) => (
        <StoryCarousel key={highlight.id} highlight={highlight} />
      ))}
    </div>
  );
}
