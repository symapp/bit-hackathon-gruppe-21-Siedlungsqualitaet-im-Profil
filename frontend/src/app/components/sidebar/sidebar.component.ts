import { Component, inject } from '@angular/core';
import { LocationService } from '../../services/location.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  protected locationService = inject(LocationService);
  protected isCollapsed = false;

  protected get radiusValue(): number {
    return this.locationService.radius();
  }

  protected set radiusValue(value: number) {
    this.locationService.setRadius(value);
  }

  toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
  }

  formatRadius(value: number): string {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)} km`;
    }
    return `${value} m`;
  }
}
