import { useCallback, useEffect, useState } from 'react';
import { getPlatform, promptInstall, snoozeInstall, isSnoozed, subscribe, detectInAppBrowser } from './installState';

/**
 * Situation d'installation de l'appareil + actions.
 *   platform     : installed | native | ios-safari | ios-other | in-app | unsupported
 *   canPropose   : on peut proposer l'installation (pas installée)
 *   snoozed      : « Plus tard » cliqué il y a moins de 7 jours
 *   install()    : installation native ; sinon ouvre le guide
 */
export default function useInstallPrompt() {
  const [platform, setPlatform] = useState(getPlatform);
  const [snoozed, setSnoozed] = useState(isSnoozed);

  useEffect(() => subscribe(() => { setPlatform(getPlatform()); setSnoozed(isSnoozed()); }), []);

  const install = useCallback(async () => {
    const outcome = await promptInstall();
    setPlatform(getPlatform());
    return outcome;
  }, []);

  const later = useCallback(() => snoozeInstall(7), []);

  return {
    platform,
    inAppName: platform === 'in-app' ? detectInAppBrowser() : null,
    canPropose: platform !== 'installed',
    snoozed,
    install,
    later,
  };
}
