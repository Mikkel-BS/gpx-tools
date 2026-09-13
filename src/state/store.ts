import {
  cloneSegments,
  countJoinableSegmentBoundaries,
  flattenTrack,
  joinTouchingSegments,
  resetTrack,
  splitTrackAtFlatIndex,
  trimTrack,
  type RoutePiece,
} from '../editor/model';
import type { GpxTrack } from '../gpx/types';

export interface TrackSelection {
  trackId: string;
  startIndex: number;
  endIndex: number;
}

export interface AppState {
  tracks: GpxTrack[];
  selectedTrackId?: string;
  selection?: TrackSelection;
  pieces: RoutePiece[];
  selectedPieceId?: string;
}

interface HistorySnapshot {
  tracks: GpxTrack[];
  pieces: RoutePiece[];
  selection?: TrackSelection;
  selectedPieceId?: string;
}

type Listener = (state: AppState) => void;

export class Store {
  private state: AppState = { tracks: [], pieces: [] };
  private listeners = new Set<Listener>();
  private past: HistorySnapshot[] = [];
  private future: HistorySnapshot[] = [];

  get(): AppState { return this.state; }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  replaceState(state: AppState): void {
    if (state.tracks.length > 4) throw new Error('Maximum of four GPX files reached.');
    this.clearHistory();
    this.state = {
      tracks: state.tracks.map((track) => this.cloneTrackForProject(track)),
      selectedTrackId: state.selectedTrackId,
      selection: state.selection ? { ...state.selection } : undefined,
      pieces: state.pieces.map((piece) => ({ ...piece })),
      selectedPieceId: state.selectedPieceId,
    };
    this.emit();
  }

  addTrack(track: GpxTrack): void {
    if (this.state.tracks.length >= 4) throw new Error('Maximum of four GPX files reached.');
    this.clearHistory();
    const pointCount = flattenTrack(track).length;
    this.state = {
      ...this.state,
      tracks: [...this.state.tracks, track],
      selectedTrackId: track.id,
      selection: { trackId: track.id, startIndex: 0, endIndex: Math.max(0, pointCount - 1) },
    };
    this.emit();
  }

  removeTrack(id: string): void {
    this.clearHistory();
    const tracks = this.state.tracks.filter((track) => track.id !== id);
    const pieces = this.state.pieces.filter((piece) => piece.trackId !== id);
    const selectedTrackId = this.state.selectedTrackId === id ? tracks[0]?.id : this.state.selectedTrackId;
    const selectedTrack = tracks.find((track) => track.id === selectedTrackId);
    const pointCount = selectedTrack ? flattenTrack(selectedTrack).length : 0;
    this.state = {
      ...this.state,
      tracks,
      pieces,
      selectedTrackId,
      selection: selectedTrack ? { trackId: selectedTrack.id, startIndex: 0, endIndex: Math.max(0, pointCount - 1) } : undefined,
      selectedPieceId: pieces.some((piece) => piece.id === this.state.selectedPieceId) ? this.state.selectedPieceId : undefined,
    };
    this.emit();
  }

  setSelectedTrack(id: string): void {
    const track = this.state.tracks.find((item) => item.id === id);
    if (!track) return;
    const pointCount = flattenTrack(track).length;
    this.state = {
      ...this.state,
      selectedTrackId: id,
      selection: { trackId: id, startIndex: 0, endIndex: Math.max(0, pointCount - 1) },
    };
    this.emit();
  }

  setSelection(startIndex: number, endIndex: number): void {
    const track = this.state.tracks.find((item) => item.id === this.state.selectedTrackId);
    if (!track) return;
    const pointCount = flattenTrack(track).length;
    if (!pointCount) return;
    const clamp = (value: number) => Math.max(0, Math.min(pointCount - 1, Math.round(value)));
    this.state = {
      ...this.state,
      selection: { trackId: track.id, startIndex: clamp(startIndex), endIndex: clamp(endIndex) },
    };
    this.emit();
  }

  trimSelectedTrack(): void {
    const track = this.state.tracks.find((item) => item.id === this.state.selectedTrackId);
    const selection = this.state.selection;
    if (!track || !selection || selection.trackId !== track.id) return;
    const trimmed = trimTrack(track, selection.startIndex, selection.endIndex);
    this.replaceEditedTrack(track.id, trimmed, 0, Math.max(0, flattenTrack(trimmed).length - 1));
  }

  resetSelectedTrack(): void {
    const track = this.state.tracks.find((item) => item.id === this.state.selectedTrackId);
    if (!track) return;
    const reset = resetTrack(track);
    this.replaceEditedTrack(track.id, reset, 0, Math.max(0, flattenTrack(reset).length - 1));
  }

  splitSelectedTrackAtStart(): void {
    const track = this.state.tracks.find((item) => item.id === this.state.selectedTrackId);
    const selection = this.state.selection;
    if (!track || !selection || selection.trackId !== track.id) return;
    const split = splitTrackAtFlatIndex(track, selection.startIndex);
    this.replaceEditedTrack(track.id, split, selection.startIndex, selection.startIndex);
  }

  joinTouchingSelectedTrackSegments(): void {
    const track = this.state.tracks.find((item) => item.id === this.state.selectedTrackId);
    if (!track) return;
    if (!countJoinableSegmentBoundaries(track)) throw new Error('No adjacent track segments share an exact endpoint, so there is nothing safe to join.');
    const joined = joinTouchingSegments(track);
    this.replaceEditedTrack(track.id, joined, 0, Math.max(0, flattenTrack(joined).length - 1));
  }

  addPiece(piece: RoutePiece): void {
    this.commitPieces([...this.state.pieces, piece], piece.id);
  }

  removePiece(id: string): void {
    this.commitPieces(
      this.state.pieces.filter((piece) => piece.id !== id),
      this.state.selectedPieceId === id ? undefined : this.state.selectedPieceId,
    );
  }

  selectPiece(id?: string): void {
    this.state = { ...this.state, selectedPieceId: id };
    this.emit();
  }

  reversePiece(id: string): void {
    this.commitPieces(this.state.pieces.map((piece) => piece.id === id ? { ...piece, reversed: !piece.reversed } : piece), id);
  }

  movePiece(id: string, direction: -1 | 1): void {
    const index = this.state.pieces.findIndex((piece) => piece.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= this.state.pieces.length) return;
    const pieces = [...this.state.pieces];
    [pieces[index], pieces[target]] = [pieces[target], pieces[index]];
    this.commitPieces(pieces, id);
  }

  clearPieces(): void {
    if (this.state.pieces.length) this.commitPieces([], undefined);
  }

  undo(): void {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(this.makeSnapshot());
    this.restoreSnapshot(previous);
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.makeSnapshot());
    this.restoreSnapshot(next);
  }

  canUndo(): boolean { return this.past.length > 0; }
  canRedo(): boolean { return this.future.length > 0; }

  private replaceEditedTrack(trackId: string, edited: GpxTrack, selectionStart: number, selectionEnd: number): void {
    const pieces = this.state.pieces.filter((piece) => piece.trackId !== trackId);
    this.snapshot();
    this.future = [];
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((item) => item.id === trackId ? edited : item),
      pieces,
      selection: { trackId, startIndex: selectionStart, endIndex: selectionEnd },
      selectedPieceId: pieces.some((piece) => piece.id === this.state.selectedPieceId) ? this.state.selectedPieceId : undefined,
    };
    this.emit();
  }

  private commitPieces(pieces: RoutePiece[], selectedPieceId?: string): void {
    this.snapshot();
    this.future = [];
    this.state = { ...this.state, pieces, selectedPieceId };
    this.emit();
  }

  private clearHistory(): void {
    this.past = [];
    this.future = [];
  }

  private snapshot(): void {
    this.past.push(this.makeSnapshot());
    if (this.past.length > 100) this.past.shift();
  }

  private makeSnapshot(): HistorySnapshot {
    return {
      tracks: this.state.tracks.map((track) => this.cloneTrackForHistory(track)),
      pieces: this.state.pieces.map((piece) => ({ ...piece })),
      selection: this.state.selection ? { ...this.state.selection } : undefined,
      selectedPieceId: this.state.selectedPieceId,
    };
  }

  private restoreSnapshot(snapshot: HistorySnapshot): void {
    this.state = {
      ...this.state,
      tracks: snapshot.tracks.map((track) => this.cloneTrackForHistory(track)),
      pieces: snapshot.pieces.map((piece) => ({ ...piece })),
      selection: snapshot.selection ? { ...snapshot.selection } : undefined,
      selectedPieceId: snapshot.selectedPieceId,
    };
    this.emit();
  }

  private cloneTrackForHistory(track: GpxTrack): GpxTrack {
    return {
      ...track,
      // originalSegments are immutable by contract, so history snapshots safely share them.
      originalSegments: track.originalSegments,
      segments: cloneSegments(track.segments),
    };
  }

  private cloneTrackForProject(track: GpxTrack): GpxTrack {
    return {
      ...track,
      originalSegments: cloneSegments(track.originalSegments),
      segments: cloneSegments(track.segments),
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}

export const store = new Store();
