import type { RoutePiece } from '../editor/model';
import type { GpxTrack } from '../gpx/types';

export interface AppState {
  tracks: GpxTrack[];
  selectedTrackId?: string;
  pieces: RoutePiece[];
}

type Listener = (state: AppState) => void;

class Store {
  private state: AppState = { tracks: [], pieces: [] };
  private listeners = new Set<Listener>();
  private past: RoutePiece[][] = [];
  private future: RoutePiece[][] = [];

  get(): AppState { return this.state; }
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
  set(update: Partial<AppState>): void {
    this.state = { ...this.state, ...update };
    this.emit();
  }
  addTrack(track: GpxTrack): void {
    if (this.state.tracks.length >= 4) throw new Error('Maximum of four GPX files reached.');
    this.set({ tracks: [...this.state.tracks, track], selectedTrackId: track.id });
  }
  removeTrack(id: string): void {
    const tracks = this.state.tracks.filter((track) => track.id !== id);
    const pieces = this.state.pieces.filter((piece) => piece.trackId !== id);
    if (pieces.length !== this.state.pieces.length) this.snapshot();
    this.state = {
      ...this.state,
      tracks,
      pieces,
      selectedTrackId: this.state.selectedTrackId === id ? tracks[0]?.id : this.state.selectedTrackId,
    };
    this.emit();
  }
  addPiece(piece: RoutePiece): void {
    this.commitPieces([...this.state.pieces, piece]);
  }
  removePiece(id: string): void {
    this.commitPieces(this.state.pieces.filter((piece) => piece.id !== id));
  }
  reversePiece(id: string): void {
    this.commitPieces(this.state.pieces.map((piece) => piece.id === id ? { ...piece, reversed: !piece.reversed } : piece));
  }
  movePiece(id: string, direction: -1 | 1): void {
    const index = this.state.pieces.findIndex((piece) => piece.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= this.state.pieces.length) return;
    const pieces = [...this.state.pieces];
    [pieces[index], pieces[target]] = [pieces[target], pieces[index]];
    this.commitPieces(pieces);
  }
  clearPieces(): void {
    if (this.state.pieces.length) this.commitPieces([]);
  }
  undo(): void {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(this.clonePieces(this.state.pieces));
    this.state = { ...this.state, pieces: previous };
    this.emit();
  }
  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.clonePieces(this.state.pieces));
    this.state = { ...this.state, pieces: next };
    this.emit();
  }
  canUndo(): boolean { return this.past.length > 0; }
  canRedo(): boolean { return this.future.length > 0; }

  private commitPieces(pieces: RoutePiece[]): void {
    this.snapshot();
    this.future = [];
    this.state = { ...this.state, pieces };
    this.emit();
  }
  private snapshot(): void {
    this.past.push(this.clonePieces(this.state.pieces));
    if (this.past.length > 100) this.past.shift();
  }
  private clonePieces(pieces: RoutePiece[]): RoutePiece[] {
    return pieces.map((piece) => ({ ...piece }));
  }
  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}

export const store = new Store();
