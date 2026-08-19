import React, { useState, useEffect } from 'react';

const DISMISS_KEY = 'messconnect_pwa_dismissed';

/**
 * Install nudge. Mobile only — installing a home-screen app is meaningless on
 * desktop, and a full-width banner there just steals the top of the page.
 * Styled in the app palette so it reads as part of the product.
 */
export const PwaInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      setShowPrompt(false);
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShowPrompt(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div
      className="lg:hidden flex items-center gap-3 px-4 py-2.5"
      style={{
        background: 'var(--orange-soft)',
        borderBottom: '1px solid var(--orange-light)',
      }}
    >
      <span
        className="material-symbols-outlined shrink-0"
        style={{ fontSize: 20, color: 'var(--orange)' }}
      >
        install_mobile
      </span>

      <p className="flex-1 text-xs font-bold leading-snug" style={{ color: 'var(--text-body)' }}>
        Add to your home screen
      </p>

      <button
        onClick={handleInstall}
        className="px-3 py-1.5 rounded-full text-[11px] font-black shrink-0 cursor-pointer"
        style={{ background: 'var(--orange)', color: '#fff' }}
      >
        Install
      </button>

      <button
        onClick={handleDismiss}
        className="shrink-0 cursor-pointer"
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', lineHeight: 0 }}
        aria-label="Dismiss"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
      </button>
    </div>
  );
};
