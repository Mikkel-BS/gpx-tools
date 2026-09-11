export interface CartographicStylePreset {
  id: string;
  label: string;
  preferredBaseProviderId: string;
  baseFilter: string;
  mapBackground: string;
  trackColors: string[];
  trackWidth: number;
  trackOpacity: number;
  selectedTrackWidth: number;
  compositeColor: string;
  compositeWidth: number;
  selectedPieceColor: string;
  selectedPieceWidth: number;
  selectionColor: string;
  selectionHaloColor: string;
  selectionHaloWidth: number;
}

export const cartographicPresets: CartographicStylePreset[] = [
  {
    id: 'book-light',
    label: 'Book Light',
    preferredBaseProviderId: 'kartverket-gray',
    baseFilter: 'grayscale(0.15) saturate(0.68) contrast(0.88) brightness(1.12)',
    mapBackground: '#eeeae1',
    trackColors: ['#a33b32', '#2e5f9f', '#3f7651', '#73518e'],
    trackWidth: 3,
    trackOpacity: 0.86,
    selectedTrackWidth: 5,
    compositeColor: '#171717',
    compositeWidth: 6,
    selectedPieceColor: '#c87500',
    selectedPieceWidth: 8,
    selectionColor: '#df9200',
    selectionHaloColor: 'rgba(255,255,255,0.94)',
    selectionHaloWidth: 8,
  },
  {
    id: 'minimal',
    label: 'Minimal',
    preferredBaseProviderId: 'kartverket-gray',
    baseFilter: 'grayscale(0.75) saturate(0.25) contrast(0.68) brightness(1.30) opacity(0.72)',
    mapBackground: '#f4f2ec',
    trackColors: ['#8f3c36', '#45658d', '#52705b', '#725f80'],
    trackWidth: 2.5,
    trackOpacity: 0.72,
    selectedTrackWidth: 4.5,
    compositeColor: '#111111',
    compositeWidth: 6,
    selectedPieceColor: '#bc6b00',
    selectedPieceWidth: 8,
    selectionColor: '#d88c00',
    selectionHaloColor: 'rgba(255,255,255,0.96)',
    selectionHaloWidth: 8,
  },
  {
    id: 'topographic',
    label: 'Topographic',
    preferredBaseProviderId: 'kartverket-topo',
    baseFilter: 'none',
    mapBackground: '#e6e7df',
    trackColors: ['#d12f3f', '#245fd1', '#21824c', '#8540a8'],
    trackWidth: 3.5,
    trackOpacity: 0.94,
    selectedTrackWidth: 5.5,
    compositeColor: '#080808',
    compositeWidth: 7,
    selectedPieceColor: '#e67f00',
    selectedPieceWidth: 9,
    selectionColor: '#ff9d00',
    selectionHaloColor: 'rgba(255,255,255,0.96)',
    selectionHaloWidth: 9,
  },
  {
    id: 'monochrome',
    label: 'Monochrome',
    preferredBaseProviderId: 'kartverket-gray',
    baseFilter: 'grayscale(1) saturate(0) contrast(0.90) brightness(1.04)',
    mapBackground: '#e9e9e6',
    trackColors: ['#4a4a4a', '#666666', '#7b7b7b', '#929292'],
    trackWidth: 2.75,
    trackOpacity: 0.78,
    selectedTrackWidth: 5,
    compositeColor: '#050505',
    compositeWidth: 6.5,
    selectedPieceColor: '#4b4b4b',
    selectedPieceWidth: 8.5,
    selectionColor: '#666666',
    selectionHaloColor: 'rgba(255,255,255,0.96)',
    selectionHaloWidth: 8,
  },
  {
    id: 'print-bw',
    label: 'Print B&W',
    preferredBaseProviderId: 'kartverket-gray',
    baseFilter: 'grayscale(1) saturate(0) contrast(1.35) brightness(1.05)',
    mapBackground: '#ffffff',
    trackColors: ['#777777', '#999999', '#555555', '#b0b0b0'],
    trackWidth: 2,
    trackOpacity: 0.58,
    selectedTrackWidth: 4,
    compositeColor: '#000000',
    compositeWidth: 5.5,
    selectedPieceColor: '#333333',
    selectedPieceWidth: 7.5,
    selectionColor: '#555555',
    selectionHaloColor: '#ffffff',
    selectionHaloWidth: 8,
  },
];

export function getCartographicPreset(id: string): CartographicStylePreset {
  return cartographicPresets.find((preset) => preset.id === id) ?? cartographicPresets[0];
}
