import React from 'react';

// ===================================================
//  CUSAT MessConnect — Cartoon Kitchen Symbols
//  Warm orange fills, bold outlines, friendly style
// ===================================================

interface SymbolProps {
  size?: number;
  className?: string;
  color?: string;
}

export const ChefHatSymbol: React.FC<SymbolProps> = ({ size = 24, className = '', color = '#FF6B35' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    <ellipse cx="16" cy="24" rx="12" ry="5" fill={color} stroke="#C04A10" strokeWidth="1.5"/>
    <rect x="8" y="14" width="16" height="12" rx="3" fill={color} stroke="#C04A10" strokeWidth="1.5"/>
    <circle cx="16" cy="12" r="8" fill="white" stroke="#C04A10" strokeWidth="1.5"/>
    <ellipse cx="16" cy="12" rx="5" ry="8" fill="white" stroke="#C04A10" strokeWidth="1.5"/>
    <circle cx="16" cy="12" r="3" fill="#FFE0C0"/>
  </svg>
);

export const FryingPanSymbol: React.FC<SymbolProps> = ({ size = 24, className = '', color = '#FF6B35' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    <circle cx="15" cy="16" r="10" fill={color} stroke="#C04A10" strokeWidth="2"/>
    <circle cx="15" cy="16" r="7" fill="#FFB870"/>
    <rect x="24" y="14" width="6" height="4" rx="2" fill="#8B5E3C" stroke="#5A3010" strokeWidth="1.5"/>
    {/* Bubble / food in pan */}
    <circle cx="12" cy="16" r="2" fill="white" opacity="0.7"/>
    <circle cx="18" cy="14" r="2.5" fill="white" opacity="0.6"/>
    <circle cx="16" cy="19" r="1.5" fill="white" opacity="0.5"/>
  </svg>
);

export const CookingPotSymbol: React.FC<SymbolProps> = ({ size = 24, className = '', color = '#5CB85C' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    {/* Pot body */}
    <path d="M6 14 Q6 26 16 26 Q26 26 26 14 Z" fill={color} stroke="#3D8B3D" strokeWidth="2"/>
    {/* Rim */}
    <ellipse cx="16" cy="14" rx="10" ry="4" fill="#7DD87D" stroke="#3D8B3D" strokeWidth="2"/>
    {/* Lid */}
    <ellipse cx="16" cy="10" rx="11" ry="4" fill="#5CB85C" stroke="#3D8B3D" strokeWidth="2"/>
    <circle cx="16" cy="8" r="2.5" fill="#3D8B3D"/>
    {/* Handles */}
    <rect x="3" y="13" width="4" height="7" rx="2" fill="#3D8B3D" stroke="#3D8B3D" strokeWidth="1"/>
    <rect x="25" y="13" width="4" height="7" rx="2" fill="#3D8B3D" stroke="#3D8B3D" strokeWidth="1"/>
    {/* Steam */}
    <path d="M13 6 Q14 2 13 -1" stroke="#A8D8A8" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    <path d="M19 5 Q20 1 19 -1" stroke="#A8D8A8" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
  </svg>
);

export const TeaKettleSymbol: React.FC<SymbolProps> = ({ size = 24, className = '', color = '#FFB830' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    {/* Kettle body */}
    <ellipse cx="15" cy="18" rx="10" ry="9" fill={color} stroke="#C08000" strokeWidth="2"/>
    {/* Spout */}
    <path d="M24 14 Q30 10 29 8 Q28 6 24 8 Q22 9 22 12" fill={color} stroke="#C08000" strokeWidth="1.5"/>
    {/* Handle */}
    <path d="M6 12 Q0 14 0 18 Q0 22 6 22" fill="none" stroke="#C08000" strokeWidth="2.5" strokeLinecap="round"/>
    {/* Lid */}
    <ellipse cx="15" cy="10" rx="8" ry="3" fill="#FFD060" stroke="#C08000" strokeWidth="1.5"/>
    <circle cx="15" cy="8" r="2" fill="#C08000"/>
    {/* Liquid highlight */}
    <ellipse cx="13" cy="18" rx="4" ry="3" fill="white" opacity="0.3"/>
    {/* Steam */}
    <path d="M12 6 Q14 1 12 -2" stroke="#FFD060" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    <path d="M18 5 Q20 0 18 -2" stroke="#FFD060" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
  </svg>
);

export const CutlerySymbol: React.FC<SymbolProps> = ({ size = 24, className = '', color = '#FF6B35' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    {/* Fork left */}
    <line x1="8" y1="4" x2="8" y2="28" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="4" y1="4" x2="4" y2="14" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="12" y1="4" x2="12" y2="14" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M4 14 Q8 18 12 14" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    {/* Knife right */}
    <line x1="22" y1="4" x2="22" y2="28" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M22 4 Q30 8 30 14 L22 14 Z" fill={color} stroke={color} strokeWidth="1"/>
  </svg>
);

export const ServingClocheSymbol: React.FC<SymbolProps> = ({ size = 24, className = '', color = '#3498DB' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    {/* Plate base */}
    <ellipse cx="16" cy="24" rx="14" ry="4" fill="#EFF4FF" stroke={color} strokeWidth="2"/>
    {/* Cloche dome */}
    <path d="M4 24 Q4 8 16 6 Q28 8 28 24 Z" fill={color} stroke={`${color}BB`} strokeWidth="2"/>
    <path d="M6 24 Q6 10 16 8 Q26 10 26 24 Z" fill={`${color}CC`}/>
    {/* Handle knob */}
    <circle cx="16" cy="6" r="3.5" fill="white" stroke={color} strokeWidth="2"/>
    {/* Steam peeking out */}
    <path d="M10 24 Q10 20 12 18" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5"/>
  </svg>
);

export const DiningPassQrSymbol: React.FC<SymbolProps> = ({ size = 24, className = '', color = '#FF6B35' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    {/* QR border */}
    <rect x="2" y="2" width="28" height="28" rx="4" fill="white" stroke={color} strokeWidth="2"/>
    {/* QR pattern simplified */}
    <rect x="5" y="5" width="9" height="9" rx="1.5" fill={color}/>
    <rect x="7" y="7" width="5" height="5" rx="0.5" fill="white"/>
    <rect x="18" y="5" width="9" height="9" rx="1.5" fill={color}/>
    <rect x="20" y="7" width="5" height="5" rx="0.5" fill="white"/>
    <rect x="5" y="18" width="9" height="9" rx="1.5" fill={color}/>
    <rect x="7" y="20" width="5" height="5" rx="0.5" fill="white"/>
    {/* Center dots */}
    <rect x="18" y="18" width="4" height="4" rx="1" fill={color}/>
    <rect x="24" y="18" width="4" height="4" rx="1" fill={color}/>
    <rect x="18" y="24" width="4" height="4" rx="1" fill={color}/>
    <rect x="24" y="24" width="4" height="4" rx="1" fill={color}/>
  </svg>
);

/* -------- Kitchen Badge Pill -------- */
export const KitchenBadgePill: React.FC<{
  icon: React.ReactNode;
  label: string;
  variant?: 'orange' | 'green' | 'yellow' | 'purple' | 'blue';
}> = ({ icon, label, variant = 'orange' }) => {
  const variantMap = {
    orange: { bg: '#FFF0EA', text: '#FF6B35', border: '#FFD4C2' },
    green:  { bg: '#F0FAF0', text: '#5CB85C', border: '#D4EDDA' },
    yellow: { bg: '#FFFBEA', text: '#C08000', border: '#FFE080' },
    purple: { bg: '#F8F0FF', text: '#9B59B6', border: '#E8D5F5' },
    blue:   { bg: '#EFF4FF', text: '#3498DB', border: '#D6EEF9' },
  };
  const s = variantMap[variant];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
      style={{
        background: s.bg,
        color: s.text,
        border: `2px solid ${s.border}`,
        fontFamily: 'Fredoka One, cursive',
        letterSpacing: '0.02em',
      }}
    >
      {icon}
      {label}
    </span>
  );
};
