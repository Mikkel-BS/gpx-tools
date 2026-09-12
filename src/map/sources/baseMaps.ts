import { getRasterProvider, rasterProviders, type RasterProvider } from './providers';
import { getVectorStyleProvider, vectorStyleProviders, type VectorStyleProvider } from './vectorStyles';

export type BaseMapDefinition =
  | ({ kind: 'raster' } & RasterProvider)
  | VectorStyleProvider;

export const baseMapDefinitions: BaseMapDefinition[] = [
  ...rasterProviders.map((provider) => ({ ...provider, kind: 'raster' as const })),
  ...vectorStyleProviders,
];

export function getBaseMapDefinition(id: string): BaseMapDefinition {
  const vector = getVectorStyleProvider(id);
  if (vector) return vector;
  const raster = getRasterProvider(id);
  return { ...raster, kind: 'raster' };
}
