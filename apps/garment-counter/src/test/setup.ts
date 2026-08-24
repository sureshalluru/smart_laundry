// Vitest setup file — extends matchers and stubs browser APIs not in jsdom.
import '@testing-library/jest-dom';

// Stub AudioContext for tests (Web Audio API not available in jsdom).
class AudioContextStub {
  state = 'suspended' as const;
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: () => {} },
      connect: () => {},
      start: () => {},
      stop: () => {},
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
      connect: () => {},
    };
  }
  get destination() {
    return {};
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

// @ts-expect-error — intentionally stubbing for test env
globalThis.AudioContext = AudioContextStub;
// @ts-expect-error
globalThis.webkitAudioContext = AudioContextStub;
