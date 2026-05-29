import { beforeEach, describe, expect, it } from 'vitest';
import { OnboardingPreferencesService } from './onboarding-preferences.service';

function createStorageMock(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe('OnboardingPreferencesService', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: createStorageMock(),
    });
    localStorage.removeItem('tinder-onboarding-prompt-seen');
    localStorage.removeItem('tinder-onboarding-completed');
  });

  it('shows prompt when nothing stored', () => {
    const service = new OnboardingPreferencesService();
    expect(service.shouldShowPrompt()).toBe(true);
  });

  it('persists completed onboarding', () => {
    const service = new OnboardingPreferencesService();
    service.markCompleted();
    expect(service.completed()).toBe(true);
    expect(localStorage.getItem('tinder-onboarding-completed')).toBe('1');
    expect(service.shouldShowPrompt()).toBe(false);
  });
});
