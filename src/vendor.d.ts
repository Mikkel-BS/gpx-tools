declare module 'qrcode-generator' {
  interface QrCode {
    addData(data: string, mode?: 'Numeric' | 'Alphanumeric' | 'Byte' | 'Kanji'): void;
    make(): void;
    isDark(row: number, col: number): boolean;
    getModuleCount(): number;
    typeNumber?: number;
  }
  type QrFactory = (typeNumber: number, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H') => QrCode;
  const qrcode: QrFactory;
  export default qrcode;
}
