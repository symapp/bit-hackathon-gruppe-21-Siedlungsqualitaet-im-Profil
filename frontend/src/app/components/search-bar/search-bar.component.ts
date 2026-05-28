import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  from,
  switchMap,
  tap,
} from 'rxjs';
import type { GeocodingResult, GeocodingSuggestionView } from '../../models/geocoding.model';
import { GeocodingService } from '../../services/geocoding.service';
import { LocationService } from '../../services/location.service';

type PanelMode = 'hidden' | 'hint' | 'loading' | 'results' | 'empty' | 'error';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './search-bar.component.html',
  styleUrl: './search-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchBarComponent {
  private readonly locationService = inject(LocationService);
  private readonly geocoding = inject(GeocodingService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly queryChanges$ = new Subject<string>();
  private fetchAbort: AbortController | null = null;
  private blurCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressQuerySync = false;

  protected readonly query = signal('');
  protected readonly suggestions = signal<GeocodingSuggestionView[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly panelOpen = signal(false);
  protected readonly highlightedIndex = signal(-1);
  private readonly inputFocused = signal(false);
  private readonly hasSearched = signal(false);

  protected readonly minQueryLength = this.geocoding.minQueryLength;

  protected readonly showClear = computed(() => this.query().length > 0);

  protected readonly panelMode = computed<PanelMode>(() => {
    if (!this.panelOpen()) {
      return 'hidden';
    }
    if (this.error()) {
      return 'error';
    }
    if (this.loading()) {
      return 'loading';
    }
    const trimmed = this.query().trim();
    if (trimmed.length < this.minQueryLength) {
      return 'hint';
    }
    if (this.hasSearched() && this.suggestions().length === 0) {
      return 'empty';
    }
    if (this.suggestions().length > 0) {
      return 'results';
    }
    return 'hidden';
  });

  constructor() {
    effect(() => {
      const address = this.locationService.address();
      if (this.inputFocused() || this.suppressQuerySync) {
        return;
      }
      this.query.set(address);
      this.closePanel();
    });

    this.queryChanges$
      .pipe(
        debounceTime(280),
        distinctUntilChanged(),
        tap(() => {
          this.error.set(null);
          this.hasSearched.set(false);
          this.highlightedIndex.set(-1);
        }),
        switchMap((query) => {
          const trimmed = query.trim();
          if (trimmed.length < this.minQueryLength) {
            this.loading.set(false);
            this.suggestions.set([]);
            return EMPTY;
          }

          this.fetchAbort?.abort();
          const abort = new AbortController();
          this.fetchAbort = abort;
          this.loading.set(true);
          this.panelOpen.set(true);

          return from(this.geocoding.searchPlaces(trimmed, abort.signal)).pipe(
            catchError((err: unknown) => {
              const message =
                err instanceof Error ? err.message : 'Adresssuche momentan nicht möglich';
              this.error.set(message);
              this.suggestions.set([]);
              this.hasSearched.set(true);
              return EMPTY;
            }),
            finalize(() => {
              if (this.fetchAbort === abort) {
                this.loading.set(false);
                this.fetchAbort = null;
              }
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        if (this.query().trim().length < this.minQueryLength) {
          return;
        }
        this.suggestions.set(results.map((result) => toSuggestionView(result)));
        this.hasSearched.set(true);
        this.highlightedIndex.set(results.length > 0 ? 0 : -1);
        this.panelOpen.set(this.inputFocused());
      });
  }

  protected onQueryChange(value: string): void {
    this.query.set(value);
    this.queryChanges$.next(value);

    const trimmed = value.trim();
    if (trimmed.length < this.minQueryLength) {
      this.suggestions.set([]);
      this.hasSearched.set(false);
      this.error.set(null);
      this.highlightedIndex.set(-1);
    }

    if (this.inputFocused()) {
      this.panelOpen.set(true);
    }
  }

  protected onInputFocus(): void {
    this.cancelBlurClose();
    this.inputFocused.set(true);
    this.panelOpen.set(true);
  }

  protected onInputBlur(): void {
    this.inputFocused.set(false);
    this.cancelBlurClose();
    this.blurCloseTimer = setTimeout(() => {
      this.revertToCommittedAddress();
      this.closePanel();
      this.blurCloseTimer = null;
    }, 120);
  }

  protected onSuggestionPointerDown(event: PointerEvent, index: number): void {
    event.preventDefault();
    this.cancelBlurClose();
    this.selectByIndex(index);
  }

  protected clearQuery(): void {
    this.cancelBlurClose();
    this.fetchAbort?.abort();
    this.fetchAbort = null;
    this.query.set('');
    this.suggestions.set([]);
    this.error.set(null);
    this.hasSearched.set(false);
    this.highlightedIndex.set(-1);
    this.loading.set(false);
    this.panelOpen.set(true);
    this.searchInput()?.nativeElement.focus();
    this.queryChanges$.next('');
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.panelOpen()) {
      if (event.key === 'ArrowDown' && this.query().trim().length >= this.minQueryLength) {
        this.panelOpen.set(true);
      } else {
        return;
      }
    }

    const count = this.suggestions().length;

    switch (event.key) {
      case 'ArrowDown':
        if (count === 0) {
          return;
        }
        event.preventDefault();
        this.highlightedIndex.update((i) => (i + 1) % count);
        break;
      case 'ArrowUp':
        if (count === 0) {
          return;
        }
        event.preventDefault();
        this.highlightedIndex.update((i) => (i <= 0 ? count - 1 : i - 1));
        break;
      case 'Enter':
        if (count === 0) {
          return;
        }
        event.preventDefault();
        this.selectByIndex(this.highlightedIndex() >= 0 ? this.highlightedIndex() : 0);
        break;
      case 'Escape':
        event.preventDefault();
        this.revertToCommittedAddress();
        this.closePanel();
        this.searchInput()?.nativeElement.blur();
        break;
    }
  }

  private selectByIndex(index: number): void {
    const suggestion = this.suggestions()[index];
    if (!suggestion) {
      return;
    }
    this.commitSelection(suggestion);
  }

  private commitSelection(suggestion: GeocodingSuggestionView): void {
    this.fetchAbort?.abort();
    this.fetchAbort = null;
    this.loading.set(false);

    this.suppressQuerySync = true;
    this.locationService.setLocation(suggestion.lat, suggestion.lng, suggestion.label);
    this.suppressQuerySync = false;

    this.query.set(suggestion.label);
    this.suggestions.set([]);
    this.error.set(null);
    this.hasSearched.set(false);
    this.highlightedIndex.set(-1);
    this.closePanel();
  }

  private revertToCommittedAddress(): void {
    this.query.set(this.locationService.address());
    this.suggestions.set([]);
    this.error.set(null);
    this.hasSearched.set(false);
    this.highlightedIndex.set(-1);
  }

  private closePanel(): void {
    this.panelOpen.set(false);
    this.highlightedIndex.set(-1);
  }

  private cancelBlurClose(): void {
    if (this.blurCloseTimer) {
      clearTimeout(this.blurCloseTimer);
      this.blurCloseTimer = null;
    }
  }
}

function toSuggestionView(result: GeocodingResult): GeocodingSuggestionView {
  const parts = result.label.split(',').map((part) => part.trim());
  return {
    ...result,
    primary: parts.slice(0, 2).join(', ') || result.label,
    secondary: parts.slice(2).join(', '),
  };
}
