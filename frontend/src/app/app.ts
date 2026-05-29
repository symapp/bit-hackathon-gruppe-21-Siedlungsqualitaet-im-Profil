import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LanguageService } from './services/language.service';
import { MeteoRefreshService } from './services/meteo-refresh.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  // Eagerly instantiate so the correct language loads before child components render.
  private readonly _lang = inject(LanguageService);
  private readonly _meteoRefresh = inject(MeteoRefreshService);

  constructor() {
    this._meteoRefresh.start();
  }
}
