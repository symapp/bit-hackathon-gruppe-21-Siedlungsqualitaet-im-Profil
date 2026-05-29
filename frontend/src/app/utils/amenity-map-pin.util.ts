/** Icon pins from this zoom level; below that, compact dots are shown. */
export const AMENITY_PIN_MIN_ZOOM = 15;

const PIN_BUBBLE_PX = 32;
const PIN_ICON_PX = 18;

export type AmenityMarkerDisplay = 'pin' | 'dot';

export function amenityMarkerDisplayForZoom(zoom: number): AmenityMarkerDisplay {
  return zoom >= AMENITY_PIN_MIN_ZOOM ? 'pin' : 'dot';
}

export function setAmenityMarkerDisplay(root: HTMLElement, display: AmenityMarkerDisplay): void {
  root.dataset['display'] = display;
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.alignItems = 'center';

  const pin = root.querySelector('.amenity-map-pin');
  if (pin instanceof HTMLElement) {
    pin.style.display = display === 'pin' ? 'flex' : 'none';
  }

  const dot = root.querySelector('.amenity-map-marker-dot');
  if (dot instanceof HTMLElement) {
    dot.style.display = display === 'dot' ? 'block' : 'none';
  }
}

/** Map marker with dot (zoomed out) or teardrop icon pin (zoomed in). */
export function createAmenityMarkerElement(iconUrl: string, label: string): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'amenity-map-marker';
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', label);
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.alignItems = 'center';

  const pin = document.createElement('div');
  pin.className = 'amenity-map-pin';
  pin.style.display = 'none';
  pin.style.flexDirection = 'column';
  pin.style.alignItems = 'center';

  const bubble = document.createElement('div');
  bubble.className = 'amenity-map-pin-bubble';
  bubble.style.display = 'flex';
  bubble.style.alignItems = 'center';
  bubble.style.justifyContent = 'center';
  bubble.style.width = `${PIN_BUBBLE_PX}px`;
  bubble.style.height = `${PIN_BUBBLE_PX}px`;
  bubble.style.transform = 'rotate(-45deg)';
  bubble.style.background = '#fff';
  bubble.style.border = '2px solid #d8232a';
  bubble.style.borderRadius = '50% 50% 50% 0';
  bubble.style.boxSizing = 'border-box';
  bubble.style.boxShadow = '0 2px 6px rgba(15, 23, 42, 0.28)';

  const icon = document.createElement('span');
  icon.className = 'amenity-map-pin-icon';
  icon.style.display = 'block';
  icon.style.width = `${PIN_ICON_PX}px`;
  icon.style.height = `${PIN_ICON_PX}px`;
  icon.style.transform = 'rotate(45deg)';
  icon.style.maskImage = `url(${iconUrl})`;
  icon.style.webkitMaskImage = `url(${iconUrl})`;
  icon.style.maskSize = '130%';
  icon.style.webkitMaskSize = '130%';
  icon.style.maskRepeat = 'no-repeat';
  icon.style.webkitMaskRepeat = 'no-repeat';
  icon.style.maskPosition = 'center';
  icon.style.webkitMaskPosition = 'center';
  icon.style.backgroundColor = '#d8232a';

  bubble.appendChild(icon);
  pin.appendChild(bubble);

  const tip = document.createElement('div');
  tip.className = 'amenity-map-pin-tip';
  tip.style.width = '0';
  tip.style.height = '0';
  tip.style.marginTop = '-1px';
  tip.style.borderLeft = '5px solid transparent';
  tip.style.borderRight = '5px solid transparent';
  tip.style.borderTop = '6px solid #d8232a';
  pin.appendChild(tip);

  root.appendChild(pin);

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
