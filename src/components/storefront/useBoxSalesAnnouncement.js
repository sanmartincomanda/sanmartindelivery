import { useEffect, useRef, useState } from 'react';
import { BOX_ANNOUNCEMENT_ID, BOX_ANNOUNCEMENT_STORAGE_KEY, boxAnnouncementDay } from '../../services/storeBoxAnnouncement.js';
import { claimBoxAnnouncement, isBoxAnnouncementDue, syncGuestBoxAnnouncementHistory } from '../../services/storeBoxAnnouncementExposure.js';

export default function useBoxSalesAnnouncement({ enabled, user, onShow, claim = claimBoxAnnouncement, delayMs = 1000 }) {
  const [settled, setSettled] = useState('');
  const [entryDay, setEntryDay] = useState(() => boxAnnouncementDay());
  const [, refresh] = useState(0);
  const current = useRef(null);
  const inFlight = useRef(new Set());
  const userKey = user?.key || '';
  const history = user?.announcementViews?.[BOX_ANNOUNCEMENT_ID];
  const key = `${userKey || 'guest'}:${entryDay}`;
  const visible = typeof document !== 'undefined' && document.visibilityState !== 'hidden';
  const candidate = enabled && visible && entryDay === boxAnnouncementDay() && settled !== key &&
    (inFlight.current.has(key) || isBoxAnnouncementDue(userKey, history));
  current.current = { eligible: enabled && visible, onShow };

  useEffect(() => {
    syncGuestBoxAnnouncementHistory(userKey, history).catch(error => {
      console.warn('No se pudo sincronizar el historial del anuncio de cajas.', error);
    });
  }, [userKey, history]);

  useEffect(() => {
    const update = event => {
      if (event.type !== 'storage' && document.visibilityState !== 'hidden') setEntryDay(boxAnnouncementDay());
      if (event.type !== 'storage' || event.key === BOX_ANNOUNCEMENT_STORAGE_KEY) refresh(value => value + 1);
    };
    window.addEventListener('storage', update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  useEffect(() => {
    if (!candidate) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);
      try {
        const shown = await claim({
          userKey, knownHistory: history,
          isEligible: () => !cancelled && current.current.eligible && document.visibilityState !== 'hidden',
        });
        if (shown && !cancelled) current.current.onShow();
      } catch (error) {
        console.warn('No se pudo registrar el anuncio de cajas; la compra sigue disponible.', error);
      } finally {
        inFlight.current.delete(key);
        setSettled(key);
      }
    }, delayMs);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [candidate, key, userKey, claim, delayMs]);

  return candidate;
}
