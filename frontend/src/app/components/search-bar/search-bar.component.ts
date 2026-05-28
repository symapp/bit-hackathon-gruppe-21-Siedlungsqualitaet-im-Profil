import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LocationService } from '../../services/location.service';

interface SearchSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './search-bar.component.html',
  styleUrl: './search-bar.component.scss'
})
export class SearchBarComponent {
  private locationService = inject(LocationService);

  protected searchQuery = '';
  protected suggestions: SearchSuggestion[] = [];
  protected isLoading = false;
  protected showSuggestions = false;
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  onSearchInput(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    if (this.searchQuery.length < 3) {
      this.suggestions = [];
      this.showSuggestions = false;
      return;
    }

    this.searchTimeout = setTimeout(() => {
      this.searchAddress();
    }, 300);
  }

  private async searchAddress(): Promise<void> {
    this.isLoading = true;
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(this.searchQuery)}&limit=5&addressdetails=1`
      );
      this.suggestions = await response.json();
      this.showSuggestions = this.suggestions.length > 0;
    } catch (error) {
      console.error('Search failed:', error);
      this.suggestions = [];
    } finally {
      this.isLoading = false;
    }
  }

  selectSuggestion(suggestion: SearchSuggestion): void {
    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);

    this.locationService.updateLocation(lat, lng, suggestion.display_name);
    this.searchQuery = suggestion.display_name;
    this.showSuggestions = false;
    this.suggestions = [];
  }

  onBlur(): void {
    // Delay to allow click on suggestion
    setTimeout(() => {
      this.showSuggestions = false;
    }, 200);
  }

  onFocus(): void {
    if (this.suggestions.length > 0) {
      this.showSuggestions = true;
    }
  }
}
