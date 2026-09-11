import type { GpxTrack } from '../gpx/types';

export interface AppState {
  tracks: GpxTrack[];
  selectedTrackId?: string;
}

type Listener = (state: AppState) => void;

class Store {
  private state: AppState = { tracks: [] };
  private listeners = new Set<Listener>();

  get(): AppState { return this.state; }
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
  set(update: Partial<AppState>): void {
    this.state = { ...this.state, ...update };
    for (const listener of this.listeners) listener(this.state);
  }
  addTrack(track: GpxTrack): void {
    if (this.state.tracks.length >= 4) throw new Error('Maximum of four GPX files reached.');
    this.set({ tracks: [...this.state.tracks, track], selectedTrackId: track.id });
  }
  removeTrack(id: string): void {
    const tracks = this.state.tracks.filter((t) => t.id !== id);
    this.set({ tracks, selectedTrackId: this.state.selectedTrackId === id ? tracks[0]?.id : this.state.selectedTrackId });
  }
}

export const store = new Store();
