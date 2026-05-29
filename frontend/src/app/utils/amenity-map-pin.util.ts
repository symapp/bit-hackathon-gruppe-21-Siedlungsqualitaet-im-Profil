/** Map marker root: compact dot. */
export function createAmenityMarkerElement(label: string): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'amenity-map-marker';
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', label);

  const dot = document.createElement('div');
  dot.className = 'amenity-map-marker-dot';
  dot.style.display = 'block';
  dot.style.width = '10px';
  dot.style.height = '10px';
  dot.style.borderRadius = '50%';
  dot.style.background = '#d8232a';
  dot.style.border = '2px solid #fff';
  dot.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.35)';
  root.appendChild(dot);

  return root;
}
