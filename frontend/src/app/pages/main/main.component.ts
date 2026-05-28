import { Component } from '@angular/core';
import { LeftOverlayComponent } from '../../components/left-overlay/left-overlay.component';
import { MapComponent } from '../../components/map/map.component';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [MapComponent, SidebarComponent, SearchBarComponent, LeftOverlayComponent],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss',
})
export class MainComponent {}
