import { Capacitor } from '@capacitor/core';

const SOURCE_LABELS = Object.freeze({
  web: 'WEB',
  android_app: 'APP Android',
  ios_app: 'APP iOS',
});

// Capture checkout runtime, never infer an app from an Android user agent.
// Client-reported attribution is not proof of eligibility for a reward.
export function captureStoreOrderSource(channel, runtime = Capacitor) {
  if (channel !== 'tienda_virtual') return {};
  const native = runtime.isNativePlatform();
  const platform = runtime.getPlatform();
  const source = !native ? 'web'
    : platform === 'android' ? 'android_app'
      : platform === 'ios' ? 'ios_app' : 'unknown';
  return { storeOrderSource: source };
}

export function getStoreOrderSourceLabel(order = {}) {
  const source = order.originalOrder?.storeOrderSource || order.storeOrderSource;
  return Object.hasOwn(SOURCE_LABELS, source) ? SOURCE_LABELS[source] : 'Origen no registrado';
}
