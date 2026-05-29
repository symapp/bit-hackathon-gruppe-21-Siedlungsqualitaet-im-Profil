import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/main/main.component').then(m => m.MainComponent)
  },
  {
    path: 'preferences/tinder',
    loadComponent: () =>
      import('./pages/tinder-preferences/tinder-preferences.page').then(
        (m) => m.TinderPreferencesPage,
      ),
  },
  {
    path: '**',
    redirectTo: ''
  }
];
