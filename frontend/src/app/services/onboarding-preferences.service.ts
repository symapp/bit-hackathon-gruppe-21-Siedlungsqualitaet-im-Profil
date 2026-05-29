import { Injectable, signal } from '@angular/core';

const PROMPT_SEEN_KEY = 'tinder-onboarding-prompt-seen';
const COMPLETED_KEY = 'tinder-onboarding-completed';

@Injectable({
  providedIn: 'root',
})
export class OnboardingPreferencesService {
  readonly promptSeen = signal<boolean>(this.loadFlag(PROMPT_SEEN_KEY));
  readonly completed = signal<boolean>(this.loadFlag(COMPLETED_KEY));

  readonly shouldShowPrompt = signal<boolean>(!this.promptSeen() && !this.completed());

  constructor() {
    this.updatePromptSignal();
  }

  markPromptSeen(): void {
    this.promptSeen.set(true);
    localStorage.setItem(PROMPT_SEEN_KEY, '1');
    this.updatePromptSignal();
  }

  markCompleted(): void {
    this.completed.set(true);
    localStorage.setItem(COMPLETED_KEY, '1');
    this.markPromptSeen();
    this.updatePromptSignal();
  }

  private updatePromptSignal(): void {
    this.shouldShowPrompt.set(!this.promptSeen() && !this.completed());
  }

  private loadFlag(key: string): boolean {
    return localStorage.getItem(key) === '1';
  }
}
