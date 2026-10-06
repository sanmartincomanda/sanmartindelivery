import { useEffect, useRef, useState } from 'react';
import { createRetailHomeView, retailViewKey } from './retailNavigationState';

export function useOnlineStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}

// Only view identifiers enter browser history. Commerce state stays with the store.
export function useRetailNavigation({ enabled, snapshot, restore }) {
  const current = useRef({ snapshot, restore });
  current.current = { snapshot, restore };
  const previous = useRef(null);
  const entries = useRef([]);
  const restoring = useRef(false);
  const homeRequested = useRef(false);
  const { search, productQuantity } = snapshot;
  const key = retailViewKey(snapshot);

  useEffect(() => {
    if (!enabled) return undefined;
    const oldRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const initial = { key, snapshot: current.current.snapshot, scroll: window.scrollY, depth: 0 };
    window.history.replaceState({ ...window.history.state, csmView: initial }, '');
    previous.current = initial;
    entries.current = [initial];
    const onScroll = () => {
      if (previous.current) previous.current.scroll = window.scrollY;
    };
    const onPop = (event) => {
      let view = event.state?.csmView;
      const localBack = [...document.querySelectorAll('[data-retail-local-back="true"]')].filter((node) => node.getClientRects().length && !node.closest('[inert]')).at(-1);
      if (!homeRequested.current && localBack && (!view || view.depth < previous.current?.depth)) {
        window.history.pushState({ ...window.history.state, csmView: previous.current }, '');
        localBack.click();
        return;
      }
      if (!view) return;
      if (homeRequested.current) {
        view = { ...view, scroll: 0, snapshot: createRetailHomeView(current.current.snapshot) };
        homeRequested.current = false;
      }
      document.documentElement.dataset.retailDirection = view.depth < previous.current?.depth ? 'back' : 'forward';
      restoring.current = true;
      previous.current = view;
      current.current.restore(view.snapshot);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.scrollTo({ top: view.scroll || 0, behavior: 'instant' });
        restoring.current = false;
      }));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('popstate', onPop);
    return () => {
      window.history.scrollRestoration = oldRestoration;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('popstate', onPop);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || restoring.current) return;
    if (previous.current?.key === key) {
      previous.current.snapshot = snapshot;
      window.history.replaceState({ ...window.history.state, csmView: previous.current }, '');
      return;
    }
    const prev = previous.current;
    if (prev) window.history.replaceState({ ...window.history.state, csmView: prev }, '');
    // Closing a screen returns to its existing entry rather than adding a duplicate.
    const earlier = entries.current.slice(0, prev?.depth || 0).findLastIndex((entry) => entry.key === key);
    if (earlier >= 0) {
      restoring.current = true;
      window.history.go(earlier - prev.depth);
      return;
    }
    const view = { key, snapshot, scroll: 0, depth: (prev?.depth || 0) + 1 };
    homeRequested.current = false;
    document.documentElement.dataset.retailDirection = 'forward';
    window.history.pushState({ ...window.history.state, csmView: view }, '');
    previous.current = view;
    entries.current = [...entries.current.slice(0, view.depth), view];
    if (snapshot.tab !== prev?.snapshot?.tab || snapshot.category !== prev?.snapshot?.category) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [enabled, key, search, productQuantity]);

  return {
    back: () => {
      if (window.history.state?.csmView?.depth > 0) window.history.back();
      else current.current.restore(createRetailHomeView(current.current.snapshot));
    },
    home: () => {
      const next = createRetailHomeView(current.current.snapshot);
      homeRequested.current = retailViewKey(next) !== previous.current?.key;
      current.current.restore(next);
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    },
  };
}

// One focus boundary for the existing overlay family, including nested map sheets.
export function useRetailFocusLayers(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    const selector = '.store-sheet-overlay, .store-closed-sheet-overlay, .sm-gold-screen, .store-map-picker-overlay, [aria-modal="true"]';
    let active = null;
    let hiddenSiblings = [];
    const returnTargets = new Map();
    const visibleLayers = () => [...document.querySelectorAll(selector)].filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
    const focusables = (node) => [...node.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter((el) => el.getClientRects().length);
    const update = () => {
      const layers = visibleLayers();
      const next = layers.at(-1) || null;
      if (next === active) return;
      hiddenSiblings.forEach(([node, wasInert]) => { node.inert = wasInert; });
      hiddenSiblings = [];
      const removed = active && !document.contains(active);
      if (removed) {
        const target = returnTargets.get(active);
        if (target?.isConnected) target.focus({ preventScroll: true });
        returnTargets.delete(active);
      }
      active = next;
      if (!next) return;
      if (!returnTargets.has(next)) returnTargets.set(next, document.activeElement);
      next.setAttribute('role', 'dialog');
      next.setAttribute('aria-modal', 'true');
      if (!next.hasAttribute('aria-label') && !next.hasAttribute('aria-labelledby')) {
        next.setAttribute('aria-label', next.querySelector('h1,h2,.store-sheet-head strong')?.textContent || 'Tienda San Martin');
      }
      if (!next.contains(document.activeElement)) focusables(next)[0]?.focus({ preventScroll: true });
      let node = next;
      while (node?.parentElement && node !== document.body) {
        for (const sibling of node.parentElement.children) {
          if (sibling !== node && !['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) {
            hiddenSiblings.push([sibling, sibling.inert]);
            sibling.inert = true;
          }
        }
        node = node.parentElement;
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    const onKey = (event) => {
      if (!active) return;
      if (event.key === 'Escape') {
        const back = active.querySelector('[data-retail-back], .store-back, .sm-gold-back-button, [aria-label^="Cerrar"]');
        if (back && !back.disabled) { event.preventDefault(); back.click(); }
      }
      if (event.key === 'Tab') {
        const nodes = focusables(active);
        const first = nodes[0]; const last = nodes.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || !active.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !active.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { observer.disconnect(); document.removeEventListener('keydown', onKey); hiddenSiblings.forEach(([node, wasInert]) => { node.inert = wasInert; }); };
  }, [enabled]);
}
