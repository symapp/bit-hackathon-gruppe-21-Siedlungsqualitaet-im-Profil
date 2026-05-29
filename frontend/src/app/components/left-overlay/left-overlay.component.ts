import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { RegionFactorsChartComponent } from '../region-factors-chart/region-factors-chart.component';
import { LocationService, type RegionOfInterest } from '../../services/location.service';

@Component({
  selector: 'app-left-overlay',
  standalone: true,
  imports: [FormsModule, TranslatePipe, RegionFactorsChartComponent],
  templateUrl: './left-overlay.component.html',
  styleUrl: './left-overlay.component.scss',
})
export class LeftOverlayComponent {
  protected readonly locationService = inject(LocationService);
  protected isCollapsed = false;

  toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
  }

  addRegion(): void {
    this.locationService.addRegion();
  }

  setActiveRegion(regionId: string): void {
    this.locationService.setActiveRegion(regionId);
  }

  updateName(region: RegionOfInterest, value: string): void {
    this.locationService.updateRegion(region.id, { name: value });
  }

  updateColor(region: RegionOfInterest, value: string): void {
    this.locationService.updateRegion(region.id, { color: value });
  }

  updateRadius(region: RegionOfInterest, value: number): void {
    this.locationService.updateRegion(region.id, { radius: value });
  }

  removeRegion(region: RegionOfInterest, event: Event): void {
    event.stopPropagation();
    this.locationService.removeRegion(region.id);
  }

  onGroceryStoresEnabledChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.locationService.setGroceryStoresEnabled(input.checked);
  }

  formatRadius(value: number): string {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)} km`;
    }
    return `${value} m`;
  }

  isActive(regionId: string): boolean {
    return this.locationService.activeRegionId() === regionId;
  }
}
