import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LeftOverlayComponent } from '../../components/left-overlay/left-overlay.component';
import { MapComponent } from '../../components/map/map.component';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';
import { OnboardingPreferencesService } from '../../services/onboarding-preferences.service';

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [MapComponent, SidebarComponent, SearchBarComponent, LeftOverlayComponent, TranslatePipe],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss',
})
export class MainComponent {
  private readonly router = inject(Router);
  protected readonly onboardingPreferences = inject(OnboardingPreferencesService);

  protected async startTinderMode(): Promise<void> {
    this.onboardingPreferences.markPromptSeen();
    await this.router.navigateByUrl('/preferences/tinder');
  }

  protected dismissPrompt(): void {
    this.onboardingPreferences.markPromptSeen();
  }
}
