import React from 'react';

import chefSrc from '../assets/food/chef.webp';
import breakfastSrc from '../assets/food/breakfast.webp';
import lunchSrc from '../assets/food/lunch.webp';
import dinnerSrc from '../assets/food/dinner.webp';
import snacksSrc from '../assets/food/snacks.webp';
import coffeeSrc from '../assets/food/coffee.webp';

/* ───────────────────────────────────────────────────────────────────────────
   Artwork.

   The chef is cut out of the restaurant-menu EPS; the food icons come from the
   breakfast/brunch icon set. Both are cropped to their content with a
   transparent background, so they sit on any card colour.

   Food icons: "Designed by macrovector / Freepik" — the free licence requires
   that credit; it is rendered at the bottom of the profile screen.

   Every component takes a `size` and fits the art inside a square of that
   size, so callers can swap art without touching layout.
   ─────────────────────────────────────────────────────────────────────────── */

interface IllustrationProps {
  size?: number;
  className?: string;
}

/** Intrinsic pixel sizes, so the browser can reserve space before decoding
 *  and never has to guess the aspect ratio. */
const DIMS: Record<string, [number, number]> = {
  [chefSrc]: [296, 460],
  [breakfastSrc]: [440, 216],
  [lunchSrc]: [440, 278],
  [dinnerSrc]: [440, 260],
  [snacksSrc]: [440, 290],
  [coffeeSrc]: [440, 313],
};

const Art: React.FC<{ src: string; size: number; className?: string; alt?: string }> = ({
  src,
  size,
  className,
  alt = '',
}) => {
  const [w, h] = DIMS[src] ?? [1, 1];
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <img
        src={src}
        alt={alt}
        width={w}
        height={h}
        loading="lazy"
        decoding="async"
        style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain' }}
      />
    </span>
  );
};

/** Breakfast — fried eggs, bacon and tomato. */
export const BreakfastCartoon: React.FC<IllustrationProps> = ({ size = 100, className }) => (
  <Art src={breakfastSrc} size={size} className={className} />
);

/** Lunch — omelette plate with salad. */
export const LunchCartoon: React.FC<IllustrationProps> = ({ size = 100, className }) => (
  <Art src={lunchSrc} size={size} className={className} />
);

/** Dinner — soft-boiled egg with rye bread. */
export const DinnerCartoon: React.FC<IllustrationProps> = ({ size = 100, className }) => (
  <Art src={dinnerSrc} size={size} className={className} />
);

/** Snacks — waffle with ice cream. */
export const SnacksCartoon: React.FC<IllustrationProps> = ({ size = 100, className }) => (
  <Art src={snacksSrc} size={size} className={className} />
);

/** Hero art on the home screen. Kept as its own export so the hero can be
 *  given a different dish from the small breakfast card later. */
export const DosaCartoon: React.FC<IllustrationProps> = ({ size = 140, className }) => (
  <Art src={breakfastSrc} size={size} className={className} />
);

/** The chef, cut out of the menu artwork. Portrait, so it is taller than wide. */
export const ChefMascot: React.FC<{ size?: number; wave?: boolean; className?: string }> = ({
  size = 80,
  className,
}) => (
  <span
    className={className}
    style={{ display: 'inline-flex', flexShrink: 0, height: size * 1.15, alignItems: 'center' }}
  >
    <img
      src={chefSrc}
      alt=""
      width={296}
      height={460}
      loading="lazy"
      decoding="async"
      style={{ height: '100%', width: 'auto', objectFit: 'contain' }}
    />
  </span>
);

/** Empty states — a cup of coffee and biscuits. */
export const EmptyPlateCartoon: React.FC<IllustrationProps> = ({ size = 80, className }) => (
  <Art src={coffeeSrc} size={size} className={className} />
);

/** Favourite toggle. */
export const FavoriteHeartButton: React.FC<{ isFav: boolean; onClick: () => void; size?: number }> = ({
  isFav,
  onClick,
  size = 32,
}) => (
  <button
    onClick={onClick}
    aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
    aria-pressed={isFav}
    style={{
      width: size,
      height: size,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <svg
      width={size * 0.8}
      height={size * 0.8}
      viewBox="0 0 24 24"
      fill={isFav ? '#F47A35' : 'none'}
      stroke={isFav ? '#F47A35' : '#C4A882'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  </button>
);

/** Accent dot colour per meal — used where desktop drops the pastel fills. */
export const MEAL_ACCENT: Record<string, string> = {
  breakfast: '#F0A93C',
  lunch: '#E4695B',
  dinner: '#9B8AD4',
  snacks: '#63B168',
};

/** Credit line required by the icon set's free licence. */
export const ART_CREDIT = 'Illustrations by macrovector / Freepik';
