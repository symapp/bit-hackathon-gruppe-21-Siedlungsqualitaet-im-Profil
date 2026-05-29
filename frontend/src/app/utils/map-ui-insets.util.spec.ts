import { mapUiPaddingEquals, readMapUiPadding } from './map-ui-insets.util';

describe('readMapUiPadding', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns zero padding when overlays are absent', () => {
    expect(readMapUiPadding()).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it('ignores collapsed sidebars', () => {
    document.body.innerHTML = `
      <div class="regions-sidebar collapsed" style="position:fixed;left:16px;top:12px;width:48px;height:48px"></div>
      <div class="sidebar collapsed" style="position:fixed;right:16px;top:12px;width:48px;height:48px"></div>
    `;

    expect(readMapUiPadding()).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it('measures mobile toolbar top inset', () => {
    document.body.innerHTML = `
      <nav class="mobile-map-toolbar" style="position:fixed;top:0;left:0;right:0;height:56px"></nav>
    `;

    const padding = readMapUiPadding();
    expect(padding.top).toBe(56 + 8);
    expect(padding.left).toBe(0);
    expect(padding.right).toBe(0);
  });

  it('measures sidebar and search bar insets', () => {
    document.body.innerHTML = `
      <div class="regions-sidebar" style="position:fixed;left:16px;top:104px;width:360px;height:200px"></div>
      <div class="sidebar" style="position:fixed;right:16px;top:16px;width:420px;height:200px"></div>
      <div class="search-container" style="position:fixed;left:50%;bottom:24px;width:520px;height:48px;transform:translateX(-50%)"></div>
    `;

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });

    const padding = readMapUiPadding();
    expect(padding.left).toBe(16 + 360 + 8 + 72);
    expect(padding.right).toBe(16 + 420 + 8 + 72);
    expect(padding.bottom).toBeGreaterThan(0);
    expect(padding.top).toBe(8);
  });
});

describe('mapUiPaddingEquals', () => {
  it('compares all edges', () => {
    expect(
      mapUiPaddingEquals(
        { top: 1, right: 2, bottom: 3, left: 4 },
        { top: 1, right: 2, bottom: 3, left: 4 },
      ),
    ).toBe(true);
    expect(
      mapUiPaddingEquals(
        { top: 1, right: 2, bottom: 3, left: 4 },
        { top: 1, right: 2, bottom: 3, left: 5 },
      ),
    ).toBe(false);
  });
});
