/**
 * Test support (not shipped code): read the app's own sample files from
 * `public/`, as tests of several modules need them.
 *
 * "The first ten frames" are frames 1–10 of scene-0916 — the ten frames the app
 * shipped as one file (`nuscenes.json`) before F7. Many expected numbers in the
 * tests (and in the design docs) were measured on exactly those frames, so they
 * stay the reference sample: same frames, same boxes, same predictions, now
 * read out of the scene's files.
 */
import { readFileSync } from 'node:fs';

const PUBLIC_DIR = new URL('../../../public/', import.meta.url);

export const REFERENCE_SCENE = 'scene-0916';
const REFERENCE_FRAME_COUNT = 10;

/** The file at a public path ("/sample-data/…"), as a URL on disk. */
export function publicFile(publicPath: string): URL {
  return new URL(publicPath.replace(/^\//, ''), PUBLIC_DIR);
}

/** Parse a JSON file by its public path. */
export function readPublicJson(publicPath: string): unknown {
  return JSON.parse(readFileSync(publicFile(publicPath), 'utf-8'));
}

type RawFrames = { version: string; scene?: string; frames: { token: string }[] };
type RawPredictions = { frames: { token: string }[] } & Record<string, unknown>;

/** The reference sample as a frames file: the first ten frames of scene-0916. */
export function readReferenceFramesRaw(): RawFrames {
  const raw = readPublicJson(`/sample-data/nuscenes/scenes/${REFERENCE_SCENE}/frames.json`) as RawFrames;
  return { ...raw, frames: raw.frames.slice(0, REFERENCE_FRAME_COUNT) };
}

/** The model's predictions for those ten frames (the scene's file, cut to them). */
export function readReferencePredictionsRaw(): RawPredictions {
  const tokens = new Set(readReferenceFramesRaw().frames.map((frame) => frame.token));
  const raw = readPublicJson(
    `/sample-data/nuscenes/scenes/${REFERENCE_SCENE}/predictions.json`,
  ) as RawPredictions;
  return { ...raw, frames: raw.frames.filter((frame) => tokens.has(frame.token)) };
}
