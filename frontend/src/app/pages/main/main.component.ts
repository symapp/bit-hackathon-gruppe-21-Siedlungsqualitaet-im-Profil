import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LeftOverlayComponent } from '../../components/left-overlay/left-overlay.component';
import { MapComponent } from '../../components/map/map.component';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';
import { OnboardingPreferencesService } from '../../services/onboarding-preferences.service';
import { LocationService } from '../../services/location.service';
import { MapPanelsService } from '../../services/map-panels.service';
import { TinderPreferencesService } from '../../services/tinder-preferences.service';

const TINDER_SUGGESTION_TOAST_MS = 5000;

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [
    MapComponent,
    SidebarComponent,
    SearchBarComponent,
    LeftOverlayComponent,
    TranslatePipe,
    RouterLink,
  ],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss',
})
export class MainComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly locationService = inject(LocationService);
  private readonly tinderPreferences = inject(TinderPreferencesService);
  protected readonly onboardingPreferences = inject(OnboardingPreferencesService);
  protected readonly mapPanels = inject(MapPanelsService);
  protected readonly toastMessage = signal<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    const suggestion = this.tinderPreferences.consumePendingSuggestion();
    if (!suggestion) {
      return;
    }
    this.locationService.setLocation(
      suggestion.place.lat,
      suggestion.place.lng,
      `${suggestion.place.name}, ${suggestion.place.canton}`,
      suggestion.place.name,
    );
    this.showToast(
      this.translate.instant('tinder.suggestion.toast', {
        name: suggestion.place.name,
        canton: suggestion.place.canton,
      }),
    );
  }

  ngOnDestroy(): void {
    this.clearToastTimer();
  }

  private showToast(message: string): void {
    this.clearToastTimer();
    this.toastMessage.set(message);
    this.toastTimer = setTimeout(() => {
      this.toastMessage.set(null);
      this.toastTimer = null;
    }, TINDER_SUGGESTION_TOAST_MS);
  }

  private clearToastTimer(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
  }

  protected async startTinderMode(): Promise<void> {
    this.onboardingPreferences.markPromptSeen();
    await this.router.navigateByUrl('/preferences/tinder');
  }

  protected dismissPrompt(): void {
    this.onboardingPreferences.markPromptSeen();
  }
}
