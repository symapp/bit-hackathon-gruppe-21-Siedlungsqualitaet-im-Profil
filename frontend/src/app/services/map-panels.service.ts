import { Injectable, computed, signal } from '@angular/core';
import { Subject } from 'rxjs';

export const MOBILE_LAYOUT_QUERY = '(max-width: 768px)';

@Injectable({ providedIn: 'root' })
export class MapPanelsService {
  private readonly closeLeft = new Subject<void>();
  private readonly closeRight = new Subject<void>();
  private readonly openLeft = new Subject<void>();
  private readonly openRight = new Subject<void>();

  readonly closeLeft$ = this.closeLeft.asObservable();
  readonly closeRight$ = this.closeRight.asObservable();
  readonly openLeft$ = this.openLeft.asObservable();
  readonly openRight$ = this.openRight.asObservable();

  readonly isMobile = signal(this.readMobile());
  readonly leftOpen = signal(false);
  readonly rightOpen = signal(false);
  readonly anyPanelOpen = computed(() => this.leftOpen() || this.rightOpen());

  constructor() {
    if (typeof globalThis.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = globalThis.matchMedia(MOBILE_LAYOUT_QUERY);
    const onChange = (): void => {
      this.isMobile.set(mediaQuery.matches);
      if (mediaQuery.matches) {
        this.closeAll();
      }
    };
    mediaQuery.addEventListener('change', onChange);
  }

  initialCollapsed(): boolean {
    return this.isMobile();
  }

  notifyOpen(panel: 'left' | 'right'): void {
    if (!this.isMobile()) {
      return;
    }
    if (panel === 'left') {
      this.closeRight.next();
    } else {
      this.closeLeft.next();
    }
  }

  setLeftOpen(open: boolean): void {
    this.leftOpen.set(open);
  }

  setRightOpen(open: boolean): void {
    this.rightOpen.set(open);
  }

  openLeftPanel(): void {
    this.notifyOpen('left');
    this.openLeft.next();
    this.setLeftOpen(true);
  }

  openRightPanel(): void {
    this.notifyOpen('right');
    this.openRight.next();
    this.setRightOpen(true);
  }

  closeAll(): void {
    this.closeLeft.next();
    this.closeRight.next();
  }

  closeRightPanel(): void {
    this.closeRight.next();
  }

  private readMobile(): boolean {
    if (typeof globalThis.matchMedia !== 'function') {
      return false;
    }
    return globalThis.matchMedia(MOBILE_LAYOUT_QUERY).matches;
  }
}
