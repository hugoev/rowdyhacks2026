import type { ProviderCapability, ProviderStatus } from '../lib/types';

const statuses = new Map<ProviderCapability, ProviderStatus>();
export function providerStatuses(): Partial<Record<ProviderCapability, ProviderStatus>> {
  return Object.fromEntries(statuses);
}
export function configureProvider(capability: ProviderCapability, configured: boolean, model: string) {
  if (!statuses.has(capability)) statuses.set(capability, { state: configured ? 'configured' : 'unconfigured', model, lastSuccessAt: null });
}
export function providerSuccess(capability: ProviderCapability) {
  const status = statuses.get(capability);
  if (status) statuses.set(capability, { ...status, state: 'working', lastSuccessAt: Date.now(), error: undefined });
}
export function providerFailure(capability: ProviderCapability, category: string) {
  const status = statuses.get(capability);
  if (status) statuses.set(capability, { ...status, state: 'degraded', error: category });
}
