export const CHECKOUT_GUARD_TTL_MS = 5 * 60 * 1000;

function getCheckoutGuardKey(serviceId) {
  return serviceId ? `checkout_in_progress_${serviceId}` : null;
}

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

export function markCheckoutInProgress(
  serviceId,
  storage = null,
  now = Date.now(),
) {
  const key = getCheckoutGuardKey(serviceId);
  const targetStorage = resolveStorage(storage);
  if (!key || !targetStorage) return;
  targetStorage.setItem(key, String(now));
}

export function clearCheckoutInProgress(serviceId, storage = null) {
  const key = getCheckoutGuardKey(serviceId);
  const targetStorage = resolveStorage(storage);
  if (!key || !targetStorage) return;
  targetStorage.removeItem(key);
}

export function isCheckoutInProgress(
  serviceId,
  storage = null,
  now = Date.now(),
) {
  const key = getCheckoutGuardKey(serviceId);
  const targetStorage = resolveStorage(storage);
  if (!key || !targetStorage) return false;

  const startedAt = Number(targetStorage.getItem(key));
  const isActive =
    Number.isFinite(startedAt) &&
    startedAt > 0 &&
    now >= startedAt &&
    now - startedAt <= CHECKOUT_GUARD_TTL_MS;

  if (!isActive) {
    targetStorage.removeItem(key);
  }

  return isActive;
}
