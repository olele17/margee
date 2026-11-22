import { useState } from 'react';
import useInstallPrompt from './useInstallPrompt';
import InstallGuide from './InstallGuide';

/**
 * Bouton permanent « Installer l'app » (barre latérale, Paramètres,
 * landing). Visible tant que l'app n'est pas installée. Android /
 * ordinateur : installation native ; sinon le guide adapté.
 */
export default function InstallButton({ className = 'btn btn-outline', label = 'Installer l\'app', icon = 'ti-device-mobile-down', children, onDone }) {
  const { platform, install } = useInstallPrompt();
  const [guide, setGuide] = useState(false);
  if (platform === 'installed') return null;

  const click = async () => {
    if (platform === 'native') {
      const outcome = await install();
      if (outcome === 'unavailable') setGuide(true);
      onDone?.();
      return;
    }
    setGuide(true);
  };

  return (
    <>
      <button type="button" className={className} onClick={click}>
        {children || (<><i className={`ti ${icon}`} aria-hidden="true" /> <span>{label}</span></>)}
      </button>
      <InstallGuide open={guide} onClose={() => { setGuide(false); onDone?.(); }} />
    </>
  );
}
