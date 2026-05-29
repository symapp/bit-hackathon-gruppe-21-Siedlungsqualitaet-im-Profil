import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FactorScoreBreakdownComponent } from '../factor-score-breakdown/factor-score-breakdown.component';
import { RegionFactorsChartComponent } from '../region-factors-chart/region-factors-chart.component';
import { LocationService, type RegionOfInterest } from '../../services/location.service';
import { getAmenityCategory, getAmenityIcon } from '../../services/overpass.service';
import { MapPanelsService } from '../../services/map-panels.service';

@Component({
  selector: 'app-left-overlay',
  standalone: true,
  imports: [FormsModule, TranslatePipe, RegionFactorsChartComponent, FactorScoreBreakdownComponent],
  templateUrl: './left-overlay.component.html',
  styleUrl: './left-overlay.component.scss',
})
export class LeftOverlayComponent implements OnInit {
  protected readonly locationService = inject(LocationService);
  private readonly translate = inject(TranslateService);
  private readonly mapPanels = inject(MapPanelsService);
  private readonly destroyRef = inject(DestroyRef);
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
  protected isCollapsed = this.mapPanels.initialCollapsed();
  protected expandedRegionId: string | null = null;
  protected expandedCategoryKey: string | null = null;

  ngOnInit(): void {
    this.mapPanels.setLeftOpen(!this.isCollapsed);
    this.mapPanels.closeLeft$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.isCollapsed = true;
      this.mapPanels.setLeftOpen(false);
    });
    this.mapPanels.openLeft$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.isCollapsed = false;
      this.mapPanels.setLeftOpen(true);
    });
  }

  toggleSidebar(): void {
    if (this.isCollapsed) {
      this.mapPanels.notifyOpen('left');
    }
    this.isCollapsed = !this.isCollapsed;
    this.mapPanels.setLeftOpen(!this.isCollapsed);
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

  formatRadius(value: number): string {
    if (value >= 1000) {
      return this.translate.instant('regions.radiusValueKilometers', {
        value: (value / 1000).toFixed(1),
      });
    }
    return this.translate.instant('regions.radiusValueMeters', { value });
  }

  isActive(regionId: string): boolean {
    return this.locationService.activeRegionId() === regionId;
  }

  overviewScoreForRegion(regionId: string): number | null {
    return this.locationService.overviewScoreForRegion(regionId);
  }
}
