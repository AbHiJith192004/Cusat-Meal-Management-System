import React, { useState, useEffect } from 'react';

export const PwaInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

  useEffect(() => {
    // Check if already in standalone mode (installed)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      alert('To install MessConnect on iOS: Tap the Share button in Safari, then select "Add to Home Screen".');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled || !showPrompt) return null;

  return (
    <div className="bg-gradient-to-r from-[#2563eb] to-[#004ac6] text-white px-4 py-2.5 shadow-md flex items-center justify-between z-40 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-[20px]">phone_iphone</span>
        </div>
        <div>
          <p className="text-xs font-bold leading-tight">Install MessConnect App</p>
          <p className="text-[11px] opacity-90">Add to home screen for instant offline meal planning</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleInstallClick}
          className="px-3 py-1 bg-white text-[#004ac6] text-xs font-bold rounded-full shadow-xs hover:bg-[#f0f3ff] transition-colors cursor-pointer"
        >
          Install App
        </button>
        <button
          onClick={() => setShowPrompt(false)}
          className="p-1 text-white/80 hover:text-white"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>
  );
};
