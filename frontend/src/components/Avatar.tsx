import React from 'react';

/**
 * A person, drawn as the first letters of their name.
 *
 * There are no profile pictures in the app. The student directory used to
 * render `photo_url` straight from the server, and for the many students who
 * have no photo that URL does not resolve -- so the admin got a browser's
 * broken-image glyph in a circle, which is worse than no picture at all. The
 * local "choose a photo for this device" upload is gone too: it wrote a
 * base64 copy into localStorage that only that one browser could ever see.
 *
 * Initials always render, need no request, and cannot break.
 */

/** "Nikhil Raj" -> "NR". Falls back to a dash rather than an empty circle. */
export const initialsOf = (name?: string): string => {
  const letters = (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('');
  return letters.toUpperCase() || '—';
};

interface AvatarProps {
  name?: string;
  /** Diameter in pixels. */
  size?: number;
  className?: string;
  /** Extra ring, for the larger identity panels. */
  emphasis?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  size = 40,
  className = '',
  emphasis = false,
}) => (
  <span
    className={`shrink-0 rounded-full inline-flex items-center justify-center font-bold ${className}`}
    style={{
      width: size,
      height: size,
      // The name is already beside every one of these, so the circle is
      // decoration and screen readers should skip it rather than spell it.
      background: 'var(--orange-soft)',
      color: 'var(--orange-ink)',
      border: `${emphasis ? 2 : 1}px solid var(--orange-light)`,
      fontFamily: 'Nunito, sans-serif',
      fontSize: Math.max(11, Math.round(size * 0.38)),
      letterSpacing: '0.02em',
      lineHeight: 1,
    }}
    aria-hidden="true"
  >
    {initialsOf(name)}
  </span>
);
