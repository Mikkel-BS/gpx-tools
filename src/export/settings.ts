export interface ImageExportSettings {
  presetId: string;
  layoutId: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  includeBaseMap: boolean;
  includeTracks: boolean;
  includeCombinedRoute: boolean;
  showScaleBar: boolean;
  showNorthArrow: boolean;
  fitMode: 'current' | 'route';
  paddingPercent: number;
  backgroundColor: string;
  border: boolean;
  routeColor: string;
  routeWidth: number;
  routeOpacity: number;
  routeHalo: boolean;
  routeHaloColor: string;
  routeHaloWidth: number;
  title: string;
  subtitle: string;
  caption: string;
  showStartEndMarkers: boolean;
}

export interface ImageStylePreset {
  id: string;
  label: string;
  values: Pick<ImageExportSettings,
    | 'backgroundColor'
    | 'border'
    | 'routeColor'
    | 'routeWidth'
    | 'routeOpacity'
    | 'routeHalo'
    | 'routeHaloColor'
    | 'routeHaloWidth'
    | 'showScaleBar'
    | 'showNorthArrow'
    | 'showStartEndMarkers'
  >;
}

export const imageStylePresets: ImageStylePreset[] = [
  {
    id: 'book-light',
    label: 'Book light',
    values: {
      backgroundColor: '#ffffff', border: false,
      routeColor: '#171717', routeWidth: 6, routeOpacity: 1,
      routeHalo: true, routeHaloColor: '#ffffff', routeHaloWidth: 10,
      showScaleBar: true, showNorthArrow: false, showStartEndMarkers: true,
    },
  },
  {
    id: 'minimal-editorial',
    label: 'Minimal editorial',
    values: {
      backgroundColor: '#f7f5ef', border: false,
      routeColor: '#292929', routeWidth: 5, routeOpacity: 0.9,
      routeHalo: false, routeHaloColor: '#ffffff', routeHaloWidth: 9,
      showScaleBar: true, showNorthArrow: false, showStartEndMarkers: false,
    },
  },
  {
    id: 'monochrome-print',
    label: 'Monochrome print',
    values: {
      backgroundColor: '#ffffff', border: true,
      routeColor: '#000000', routeWidth: 5.5, routeOpacity: 1,
      routeHalo: true, routeHaloColor: '#ffffff', routeHaloWidth: 9.5,
      showScaleBar: true, showNorthArrow: false, showStartEndMarkers: true,
    },
  },
  {
    id: 'high-contrast-trail',
    label: 'High-contrast trail',
    values: {
      backgroundColor: '#ffffff', border: false,
      routeColor: '#d12f3f', routeWidth: 7, routeOpacity: 1,
      routeHalo: true, routeHaloColor: '#ffffff', routeHaloWidth: 12,
      showScaleBar: true, showNorthArrow: true, showStartEndMarkers: true,
    },
  },
];

export function defaultImageExportSettings(): ImageExportSettings {
  return {
    presetId: 'book-light',
    layoutId: 'book-landscape',
    widthMm: 160,
    heightMm: 100,
    dpi: 300,
    includeBaseMap: true,
    includeTracks: false,
    includeCombinedRoute: true,
    showScaleBar: true,
    showNorthArrow: false,
    fitMode: 'route',
    paddingPercent: 8,
    backgroundColor: '#ffffff',
    border: false,
    routeColor: '#171717',
    routeWidth: 6,
    routeOpacity: 1,
    routeHalo: true,
    routeHaloColor: '#ffffff',
    routeHaloWidth: 10,
    title: '',
    subtitle: '',
    caption: '',
    showStartEndMarkers: true,
  };
}

export function applyImageStylePreset(settings: ImageExportSettings, presetId: string): ImageExportSettings {
  const preset = imageStylePresets.find((item) => item.id === presetId) ?? imageStylePresets[0];
  return { ...settings, presetId: preset.id, ...preset.values };
}
