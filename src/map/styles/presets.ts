export interface CartographicStylePreset {
  id: string;
  label: string;
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
    trackWidth: 3,
    trackOpacity: 0.82,
    selectedTrackWidth: 5,
    compositeColor: '#171717',
    compositeWidth: 6,
    selectedPieceColor: '#d98200',
    selectedPieceWidth: 8,
    selectionColor: '#f0a500',
    selectionHaloColor: 'rgba(255,255,255,0.92)',
    selectionHaloWidth: 8,
  },
  {
    id: 'minimal',
    label: 'Minimal',
    trackWidth: 2,
    trackOpacity: 0.58,
    selectedTrackWidth: 4,
    compositeColor: '#202020',
    compositeWidth: 5,
    selectedPieceColor: '#d98200',
    selectedPieceWidth: 7,
    selectionColor: '#f0a500',
    selectionHaloColor: 'rgba(255,255,255,0.9)',
    selectionHaloWidth: 7,
  },
  {
    id: 'topographic',
    label: 'Topographic',
    trackWidth: 3,
    trackOpacity: 0.9,
    selectedTrackWidth: 5,
    compositeColor: '#111111',
    compositeWidth: 7,
    selectedPieceColor: '#e08a00',
    selectedPieceWidth: 9,
    selectionColor: '#ffad00',
    selectionHaloColor: 'rgba(255,255,255,0.94)',
    selectionHaloWidth: 9,
  },
  {
    id: 'monochrome',
    label: 'Monochrome',
    trackWidth: 2.5,
    trackOpacity: 0.7,
    selectedTrackWidth: 4.5,
    compositeColor: '#000000',
    compositeWidth: 6,
    selectedPieceColor: '#555555',
    selectedPieceWidth: 8,
    selectionColor: '#777777',
    selectionHaloColor: 'rgba(255,255,255,0.95)',
    selectionHaloWidth: 8,
  },
  {
    id: 'print-bw',
    label: 'Print B&W',
    trackWidth: 2,
    trackOpacity: 0.52,
    selectedTrackWidth: 4,
    compositeColor: '#000000',
    compositeWidth: 5,
    selectedPieceColor: '#444444',
    selectedPieceWidth: 7,
    selectionColor: '#666666',
    selectionHaloColor: '#ffffff',
    selectionHaloWidth: 7,
  },
];

export function getCartographicPreset(id: string): CartographicStylePreset {
  return cartographicPresets.find((preset) => preset.id === id) ?? cartographicPresets[0];
}
