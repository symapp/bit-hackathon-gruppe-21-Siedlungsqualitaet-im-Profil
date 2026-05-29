import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { FactorScoreBreakdownComponent } from '../factor-score-breakdown/factor-score-breakdown.component';
import { RegionFactorsChartComponent } from '../region-factors-chart/region-factors-chart.component';
import { LocationService, type RegionOfInterest } from '../../services/location.service';
import { getAmenityCategory, getAmenityIcon } from '../../services/overpass.service';

@Component({
  selector: 'app-left-overlay',
  standalone: true,
  imports: [FormsModule, TranslatePipe, RegionFactorsChartComponent, FactorScoreBreakdownComponent],
  templateUrl: './left-overlay.component.html',
  styleUrl: './left-overlay.component.scss',
})
export class LeftOverlayComponent {
  protected readonly locationService = inject(LocationService);
  protected readonly Math = Math;
  protected readonly getAmenityIcon = getAmenityIcon;
  protected readonly getAmenityCategory = getAmenityCategory;
  protected readonly categories = [
    { key: 'shopping', icon: 'shopping-cart', label: 'sidebar.amenityCategoryShopping' },
    { key: 'health', icon: 'heart', label: 'sidebar.amenityCategoryHealth' },
    { key: 'pharmacy', icon: 'plus', label: 'sidebar.amenityCategoryPharmacy' },
    { key: 'culture', icon: 'theater_masks', label: 'sidebar.amenityCategoryCulture' },
    { key: 'hospital', icon: 'hospital', label: 'sidebar.amenityCategoryHospital' },
  ] as const;
  protected isCollapsed = false;
  protected expandedRegionId: string | null = null;
  protected expandedCategoryKey: string | null = null;

  toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
  }

  toggleCategory(regionId: string, categoryKey: string, event: Event): void {
    event.stopPropagation();
    if (this.expandedRegionId === regionId && this.expandedCategoryKey === categoryKey) {
      this.expandedRegionId = null;
      this.expandedCategoryKey = null;
    } else {
      this.expandedRegionId = regionId;
      this.expandedCategoryKey = categoryKey;
      this.locationService.setActiveRegion(regionId);
    }
  }

  addRegion(): void {
    this.locationService.addRegion();
  }

  setActiveRegion(regionId: string): void {
    this.locationService.setActiveRegion(regionId);
  }

  updateName(region: RegionOfInterest, value: string): void {
    this.locationService.markRegionNameTouched(region.id);
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

  onAmenitiesEnabledChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.locationService.setAmenitiesEnabled(input.checked);
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

  overviewScoreForRegion(regionId: string): number | null {
    return this.locationService.overviewScoreForRegion(regionId);
  }
}
