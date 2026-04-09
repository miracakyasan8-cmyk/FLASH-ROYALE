type AudioPrefs = {
  sfxEnabled: boolean;
  musicEnabled: boolean;
  sfxVolume: number;
  musicVolume: number;
};

let audioCtx: AudioContext | null = null;
let sfxGainNode: GainNode | null = null;
let lastHitAt = 0;

type HitVoice = {
  baseFreq: number;
  bodyWave: OscillatorType;
  snapWave: OscillatorType;
  bodyGain: number;
  edgeGain: number;
  edgePitch: number;
};

const prefs: AudioPrefs = {
  sfxEnabled: true,
  // Background music intentionally disabled by request.
  musicEnabled: false,
  sfxVolume: 0.7,
  musicVolume: 0,
};

const HIT_BODY_WAVES: OscillatorType[] = ['sine', 'triangle'];
const HIT_EDGE_WAVES: OscillatorType[] = ['triangle', 'sine'];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const ensureAudio = () => {
  if (audioCtx) return;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return;

  audioCtx = new Ctx();
  sfxGainNode = audioCtx.createGain();

  sfxGainNode.gain.value = prefs.sfxEnabled ? prefs.sfxVolume : 0;

  sfxGainNode.connect(audioCtx.destination);
};

const playTone = (
  frequency: number,
  duration: number,
  wave: OscillatorType,
  gainValue: number,
) => {
  ensureAudio();
  if (!audioCtx || !sfxGainNode) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = wave;
  osc.frequency.value = frequency;

  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue), audioCtx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(sfxGainNode);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
};

export const unlockAudio = () => {
  ensureAudio();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
};

export const setAudioPreferences = (next: Partial<AudioPrefs>) => {
  Object.assign(prefs, next);
  prefs.sfxVolume = clamp01(prefs.sfxVolume);
  prefs.musicVolume = clamp01(prefs.musicVolume);

  ensureAudio();
  if (!audioCtx) return;

  if (sfxGainNode) {
    sfxGainNode.gain.value = prefs.sfxEnabled ? prefs.sfxVolume : 0;
  }
};

export const playMenuClick = () => {
  if (!prefs.sfxEnabled) return;
  unlockAudio();
  playTone(680, 0.09, 'triangle', Math.max(0.05, prefs.sfxVolume * 0.5));
};

export const playDeploySfx = () => {
  if (!prefs.sfxEnabled) return;
  unlockAudio();
  playTone(420, 0.12, 'square', Math.max(0.05, prefs.sfxVolume * 0.35));
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const getHitVoice = (key?: string): HitVoice => {
  const specialVoices: Record<string, HitVoice> = {
    c36: { baseFreq: 202, bodyWave: 'triangle', snapWave: 'sine', bodyGain: 0.25, edgeGain: 0.12, edgePitch: 1.3 },
    c37: { baseFreq: 248, bodyWave: 'sine', snapWave: 'triangle', bodyGain: 0.2, edgeGain: 0.11, edgePitch: 1.36 },
    c38: { baseFreq: 178, bodyWave: 'triangle', snapWave: 'sine', bodyGain: 0.27, edgeGain: 0.1, edgePitch: 1.22 },
    c39: { baseFreq: 224, bodyWave: 'triangle', snapWave: 'triangle', bodyGain: 0.24, edgeGain: 0.12, edgePitch: 1.35 },
    c40: { baseFreq: 236, bodyWave: 'sine', snapWave: 'sine', bodyGain: 0.21, edgeGain: 0.1, edgePitch: 1.4 },
    c41: { baseFreq: 192, bodyWave: 'triangle', snapWave: 'sine', bodyGain: 0.26, edgeGain: 0.11, edgePitch: 1.24 },
    c42: { baseFreq: 229, bodyWave: 'triangle', snapWave: 'triangle', bodyGain: 0.24, edgeGain: 0.13, edgePitch: 1.38 },
    c43: { baseFreq: 258, bodyWave: 'sine', snapWave: 'triangle', bodyGain: 0.2, edgeGain: 0.12, edgePitch: 1.42 },
    c44: { baseFreq: 184, bodyWave: 'triangle', snapWave: 'sine', bodyGain: 0.27, edgeGain: 0.11, edgePitch: 1.2 },
    c45: { baseFreq: 216, bodyWave: 'triangle', snapWave: 'triangle', bodyGain: 0.25, edgeGain: 0.12, edgePitch: 1.33 },
    c46: { baseFreq: 246, bodyWave: 'sine', snapWave: 'triangle', bodyGain: 0.21, edgeGain: 0.12, edgePitch: 1.41 },
    c47: { baseFreq: 176, bodyWave: 'triangle', snapWave: 'sine', bodyGain: 0.29, edgeGain: 0.1, edgePitch: 1.19 },
    c48: { baseFreq: 234, bodyWave: 'triangle', snapWave: 'triangle', bodyGain: 0.24, edgeGain: 0.13, edgePitch: 1.37 },
    c49: { baseFreq: 262, bodyWave: 'sine', snapWave: 'triangle', bodyGain: 0.2, edgeGain: 0.12, edgePitch: 1.45 },
    c50: { baseFreq: 170, bodyWave: 'triangle', snapWave: 'sine', bodyGain: 0.3, edgeGain: 0.1, edgePitch: 1.17 },
    c51: { baseFreq: 214, bodyWave: 'triangle', snapWave: 'sine', bodyGain: 0.24, edgeGain: 0.12, edgePitch: 1.32 },
    c52: { baseFreq: 244, bodyWave: 'sine', snapWave: 'triangle', bodyGain: 0.21, edgeGain: 0.12, edgePitch: 1.39 },
    c53: { baseFreq: 208, bodyWave: 'triangle', snapWave: 'triangle', bodyGain: 0.25, edgeGain: 0.12, edgePitch: 1.31 },
    c54: { baseFreq: 182, bodyWave: 'triangle', snapWave: 'sine', bodyGain: 0.28, edgeGain: 0.11, edgePitch: 1.23 },
    c55: { baseFreq: 252, bodyWave: 'sine', snapWave: 'triangle', bodyGain: 0.22, edgeGain: 0.12, edgePitch: 1.43 },
  };

  if (key && specialVoices[key]) {
    return specialVoices[key];
  }

  if (!key) {
    return { baseFreq: 210, bodyWave: 'triangle', snapWave: 'sine', bodyGain: 0.24, edgeGain: 0.12, edgePitch: 1.35 };
  }

  const hash = hashString(key);
  const semitoneOffset = hash % 5;
  const baseFreq = 185 * Math.pow(2, semitoneOffset / 12);
  const bodyWave = HIT_BODY_WAVES[hash % HIT_BODY_WAVES.length];
  const snapWave = HIT_EDGE_WAVES[hash % HIT_EDGE_WAVES.length];
  return { baseFreq, bodyWave, snapWave, bodyGain: 0.24, edgeGain: 0.12, edgePitch: 1.35 };
};

export const playHitSfx = (characterKey?: string) => {
  if (!prefs.sfxEnabled) return;
  const now = performance.now();
  if (now - lastHitAt < 65) return;
  lastHitAt = now;

  ensureAudio();
  unlockAudio();
  if (!audioCtx || !sfxGainNode) return;

  const { baseFreq, bodyWave, snapWave, bodyGain: voiceBodyGain, edgeGain: voiceEdgeGain, edgePitch } = getHitVoice(characterKey);
  const current = audioCtx.currentTime;

  const bodyTone = audioCtx.createOscillator();
  const edgeTone = audioCtx.createOscillator();
  const bodyGain = audioCtx.createGain();
  const edgeGain = audioCtx.createGain();
  const masterGain = audioCtx.createGain();
  const bandpass = audioCtx.createBiquadFilter();
  const lowpass = audioCtx.createBiquadFilter();
  const compressor = audioCtx.createDynamicsCompressor();

  bandpass.type = 'bandpass';
  bandpass.frequency.setValueAtTime(620, current);
  bandpass.Q.setValueAtTime(0.7, current);

  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(1200, current);
  lowpass.Q.setValueAtTime(0.5, current);

  compressor.threshold.setValueAtTime(-22, current);
  compressor.knee.setValueAtTime(16, current);
  compressor.ratio.setValueAtTime(2.3, current);
  compressor.attack.setValueAtTime(0.005, current);
  compressor.release.setValueAtTime(0.12, current);

  bodyTone.type = bodyWave;
  bodyTone.frequency.setValueAtTime(baseFreq, current);
  bodyTone.frequency.exponentialRampToValueAtTime(Math.max(120, baseFreq * 0.78), current + 0.16);

  edgeTone.type = snapWave;
  edgeTone.frequency.setValueAtTime(baseFreq * edgePitch, current);
  edgeTone.frequency.exponentialRampToValueAtTime(Math.max(170, baseFreq * 0.98), current + 0.08);

  bodyGain.gain.setValueAtTime(0.0001, current);
  bodyGain.gain.linearRampToValueAtTime(Math.max(0.0001, prefs.sfxVolume * voiceBodyGain), current + 0.011);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, current + 0.2);

  edgeGain.gain.setValueAtTime(0.0001, current);
  edgeGain.gain.linearRampToValueAtTime(Math.max(0.0001, prefs.sfxVolume * voiceEdgeGain), current + 0.005);
  edgeGain.gain.exponentialRampToValueAtTime(0.0001, current + 0.11);

  masterGain.gain.setValueAtTime(1.08, current);

  bodyTone.connect(bodyGain);
  edgeTone.connect(edgeGain);
  bodyGain.connect(masterGain);
  edgeGain.connect(masterGain);
  masterGain.connect(bandpass);
  bandpass.connect(lowpass);
  lowpass.connect(compressor);
  compressor.connect(sfxGainNode);

  bodyTone.start(current);
  edgeTone.start(current);
  edgeTone.stop(current + 0.12);
  bodyTone.stop(current + 0.22);
};

export const startBackgroundMusic = () => {
  // Intentionally no-op: game no longer plays background music.
};

export const stopBackgroundMusic = () => {
  // Intentionally no-op: game no longer plays background music.
};
