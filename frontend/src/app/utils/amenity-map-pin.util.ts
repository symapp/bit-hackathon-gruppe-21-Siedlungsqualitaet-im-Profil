/** Full icon pins from this zoom level upward. */
export const AMENITY_PIN_MIN_ZOOM = 13;
/** Simple dots from this zoom level until pins; hidden below. */
export const AMENITY_DOT_MIN_ZOOM = 11;

export type AmenityMarkerDisplay = 'pin' | 'dot' | 'hidden';

const PIN_BUBBLE_PX = 52;
const PIN_ICON_PX = 30;

export function amenityMarkerDisplayForZoom(zoom: number): AmenityMarkerDisplay {
  if (zoom < AMENITY_DOT_MIN_ZOOM) {
    return 'hidden';
  }
  if (zoom < AMENITY_PIN_MIN_ZOOM) {
    return 'dot';
  }
  return 'pin';
}

export function setAmenityMarkerDisplay(root: HTMLElement, display: AmenityMarkerDisplay): void {
  root.dataset['display'] = display;
  root.style.display = display === 'hidden' ? 'none' : 'flex';

  const pin = root.querySelector('.amenity-map-pin');
  if (pin instanceof HTMLElement) {
    pin.style.display = display === 'pin' ? 'flex' : 'none';
  }

  const dot = root.querySelector('.amenity-map-marker-dot');
  if (dot instanceof HTMLElement) {
    dot.style.display = display === 'dot' ? 'block' : 'none';
  }
}

/** Map marker root: full pin or compact dot depending on zoom. */
export function createAmenityMarkerElement(iconUrl: string, label: string): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'amenity-map-marker';
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', label);

  root.appendChild(createAmenityPinElement(iconUrl));
  root.appendChild(createAmenityDotElement());

  return root;
}

function createAmenityPinElement(iconUrl: string): HTMLDivElement {
  const pin = document.createElement('div');
  pin.className = 'amenity-map-pin';

  const bubble = document.createElement('div');
  bubble.className = 'amenity-map-pin-bubble';
  bubble.style.display = 'flex';
  bubble.style.alignItems = 'center';
  bubble.style.justifyContent = 'center';
  bubble.style.width = `${PIN_BUBBLE_PX}px`;
  bubble.style.height = `${PIN_BUBBLE_PX}px`;
  bubble.style.transform = 'rotate(-45deg)';
  bubble.style.background = '#fff';
  bubble.style.border = '2.5px solid #d8232a';
  bubble.style.borderRadius = '50% 50% 50% 0';
  bubble.style.boxSizing = 'border-box';

  const icon = document.createElement('span');
  icon.className = 'amenity-map-pin-icon';
  icon.style.display = 'block';
  icon.style.width = `${PIN_ICON_PX}px`;
  icon.style.height = `${PIN_ICON_PX}px`;
  icon.style.maskImage = `url(${iconUrl})`;
  icon.style.webkitMaskImage = `url(${iconUrl})`;
  icon.style.maskSize = '130%';
  icon.style.webkitMaskSize = '130%';
  icon.style.maskRepeat = 'no-repeat';
  icon.style.webkitMaskRepeat = 'no-repeat';
  icon.style.maskPosition = 'center';
  icon.style.webkitMaskPosition = 'center';
  icon.style.backgroundColor = '#d8232a';
  icon.style.transform = 'rotate(45deg)';

  bubble.appendChild(icon);
  pin.appendChild(bubble);

  const tip = document.createElement('div');
  tip.className = 'amenity-map-pin-tip';
  tip.style.borderLeftWidth = '8px';
  tip.style.borderRightWidth = '8px';
  tip.style.borderTopWidth = '10px';
  pin.appendChild(tip);

  return pin;
}

function createAmenityDotElement(): HTMLDivElement {
  const dot = document.createElement('div');
  dot.className = 'amenity-map-marker-dot';
  dot.setAttribute('aria-hidden', 'true');
  dot.style.display = 'none';
  dot.style.width = '10px';
  dot.style.height = '10px';
  dot.style.borderRadius = '50%';
  dot.style.background = '#d8232a';
  dot.style.border = '2px solid #fff';
  dot.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.35)';
  return dot;
}
