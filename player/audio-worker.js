// Synthesizes the soundtrack in the browser with the same score code as out/audio.wav.
import { renderAudio } from '../src/audio/score.js';

self.onmessage = (e) => {
  const { sampleRate } = e.data;
  const { left, right } = renderAudio(sampleRate);
  self.postMessage({ left, right }, [left.buffer, right.buffer]);
};
