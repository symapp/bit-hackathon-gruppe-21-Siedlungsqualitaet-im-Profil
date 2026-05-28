import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LanguageService, type Locale } from '../../services/language.service';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  templateUrl: './language-selector.component.html',
  styleUrl: './language-selector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSelectorComponent {
  protected readonly languageService = inject(LanguageService);

  protected select(code: Locale): void {
    this.languageService.setLocale(code);
  }
}
