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

/** Rice Meal Illustration — Always Rice with Fish Curry / Chicken Curry for Lunch */
export const RiceMealIllustration: React.FC<{ size?: number; className?: string }> = ({ size = 100, className }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Plate / Thali Base */}
    <circle cx="60" cy="60" r="54" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="4" />
    <circle cx="60" cy="60" r="48" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2" />
    
    {/* Steaming Rice Mound in center */}
    <ellipse cx="60" cy="62" rx="26" ry="20" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" />
    <circle cx="50" cy="56" r="3" fill="#E2E8F0" />
    <circle cx="62" cy="52" r="3.5" fill="#E2E8F0" />
    <circle cx="70" cy="58" r="3" fill="#E2E8F0" />
    <circle cx="56" cy="66" r="3.5" fill="#E2E8F0" />
    <circle cx="66" cy="68" r="3" fill="#E2E8F0" />
    
    {/* Fish Curry Bowl (Top Right) */}
    <circle cx="82" cy="38" r="16" fill="#EA580C" stroke="#C2410C" strokeWidth="2" />
    {/* Fish Piece */}
    <path d="M76 38 C80 34 86 34 88 38 C86 42 80 42 76 38 Z" fill="#F97316" stroke="#9A3412" strokeWidth="1.5" />
    <circle cx="86" cy="37" r="1" fill="#7C2D12" />
    
    {/* Chicken Curry Bowl (Top Left) */}
    <circle cx="38" cy="38" r="16" fill="#B91C1C" stroke="#991B1B" strokeWidth="2" />
    {/* Chicken Piece */}
    <path d="M32 38 C34 32 42 32 44 38 C42 44 34 44 32 38 Z" fill="#EF4444" stroke="#7F1D1D" strokeWidth="1.5" />

    {/* Kerala Thoran / Veg Bowl (Bottom Center) */}
    <circle cx="60" cy="90" r="14" fill="#15803D" stroke="#166534" strokeWidth="2" />
    <circle cx="56" cy="88" r="2" fill="#22C55E" />
    <circle cx="64" cy="92" r="2" fill="#22C55E" />

    {/* Steam lines above rice */}
    <path d="M54 34 Q56 26 52 20" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6" />
    <path d="M62 32 Q64 24 60 18" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6" />
    <path d="M70 34 Q72 26 68 20" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6" />
  </svg>
);

/** Chapati & Porotta Bread Illustration — For Breakfast & Dinner */
export const BreadMealIllustration: React.FC<{ size?: number; className?: string }> = ({ size = 100, className }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Plate Base */}
    <circle cx="60" cy="60" r="54" fill="#FEF3C7" stroke="#FDE68A" strokeWidth="4" />
    <circle cx="60" cy="60" r="48" fill="#FFFBEB" stroke="#FCD34D" strokeWidth="2" />

    {/* Layered Porotta / Chapati 1 */}
    <ellipse cx="50" cy="62" rx="26" ry="20" fill="#F59E0B" stroke="#D97706" strokeWidth="2" />
    <ellipse cx="50" cy="62" rx="20" ry="14" fill="#FBBF24" />
    <path d="M38 60 Q50 56 62 60" stroke="#B45309" strokeWidth="1.5" fill="none" strokeDasharray="3 3" />

    {/* Layered Porotta / Chapati 2 (Stacked on top) */}
    <ellipse cx="65" cy="54" rx="24" ry="18" fill="#FBBF24" stroke="#D97706" strokeWidth="2" />
    <ellipse cx="65" cy="54" rx="18" ry="12" fill="#FDE68A" />
    <path d="M52 52 Q65 48 76 52" stroke="#B45309" strokeWidth="1.5" fill="none" strokeDasharray="3 3" />

    {/* Curry Bowl (Bottom Right) */}
    <circle cx="78" cy="82" r="16" fill="#C2410C" stroke="#9A3412" strokeWidth="2" />
    <circle cx="78" cy="82" r="12" fill="#EA580C" />
    <circle cx="75" cy="80" r="2.5" fill="#FEF08A" />
    <circle cx="82" cy="84" r="2" fill="#FEF08A" />
  </svg>
);

/** Breakfast — Chapati, Porotta & Dosa. */
export const BreakfastCartoon: React.FC<IllustrationProps> = ({ size = 100, className }) => (
  <BreadMealIllustration size={size} className={className} />
);

/** Lunch — Always Rice with Fish Curry / Chicken Curry & Kerala Rice Meals. */
export const LunchCartoon: React.FC<IllustrationProps> = ({ size = 100, className }) => (
  <RiceMealIllustration size={size} className={className} />
);

/** Dinner — Chapati, Porotta & Curry. */
export const DinnerCartoon: React.FC<IllustrationProps> = ({ size = 100, className }) => (
  <BreadMealIllustration size={size} className={className} />
);

/** Snacks — waffle with ice cream. */
export const SnacksCartoon: React.FC<IllustrationProps> = ({ size = 100, className }) => (
  <Art src={snacksSrc} size={size} className={className} />
);

/** Hero art on the home screen. Kept as its own export. */
export const DosaCartoon: React.FC<IllustrationProps> = ({ size = 140, className }) => (
  <BreadMealIllustration size={size} className={className} />
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
