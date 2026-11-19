// All sound is synthesized with WebAudio: no audio files, no network. The engine is a
// looped pair of oscillators whose pitch follows the car's speed; the siren is a quiet
// two-tone loop while the police are after the player; everything else is a one-shot
// built from an oscillator or a burst of filtered noise. Audio starts on the first user
// gesture, as browsers require, and M mutes it.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;
  try {
    muted = window.localStorage.getItem('solmar-city.muted') === '1';
  } catch {
    muted = false;
  }

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  function unlock() {
    if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
  }

  function noiseBuffer(seconds) {
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freqA, freqB, duration, type, volume) {
    if (!ensure()) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqB), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function thud(volume, duration, cutoff) {
    if (!ensure()) return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    engineOsc = context.createOscillator();
    engineOsc2 = context.createOscillator();
    engineFilter = context.createBiquadFilter();
    engineGain = context.createGain();
    engineOsc.type = 'sawtooth';
    engineOsc2.type = 'square';
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 900;
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();
  }

  function startSiren() {
    if (!ensure() || sirenOsc) return;
    sirenOsc = context.createOscillator();
    sirenGain = context.createGain();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 720;
    sirenGain.gain.value = 0.0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      try {
        window.localStorage.setItem('solmar-city.muted', muted ? '1' : '0');
      } catch {
        // Storage can be off: the mute then lasts this visit only.
      }
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    /** Call every frame with the driving state: speed 0..1, or null when on foot. */
    engine(speed, dt) {
      if (speed === null) {
        if (engineGain) engineGain.gain.value = 0;
        return;
      }
      startEngine();
      if (!engineOsc) return;
      const base = 55 + speed * 165;
      engineOsc.frequency.value = base;
      engineOsc2.frequency.value = base * 0.5 + 2;
      engineGain.gain.value = 0.05 + speed * 0.06;
      engineFilter.frequency.value = 500 + speed * 1400;
    },
    /** Call every frame: true while any police chase is active. */
    siren(active, dt) {
      if (!active) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      startSiren();
      if (!sirenOsc) return;
      sirenTimer -= dt;
      if (sirenTimer <= 0) {
        sirenTimer = 0.42;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.value = sirenHigh ? 920 : 660;
      }
      sirenGain.gain.value = 0.045;
    },
    shoot() {
      thud(0.5, 0.14, 2600);
      blip(220, 60, 0.1, 'square', 0.25);
    },
    punch() {
      thud(0.4, 0.09, 900);
    },
    crash(strength) {
      thud(Math.min(0.7, 0.25 + strength * 0.5), 0.22, 500);
    },
    pickup() {
      blip(880, 1320, 0.12, 'sine', 0.3);
    },
    cash() {
      blip(990, 990, 0.09, 'sine', 0.25);
      setTimeout(() => blip(1320, 1320, 0.12, 'sine', 0.25), 90);
    },
    missionDone() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        setTimeout(() => blip(freq, freq, 0.16, 'triangle', 0.3), i * 110);
      });
    },
    busted() {
      blip(392, 311, 0.35, 'sawtooth', 0.3);
      setTimeout(() => blip(311, 233, 0.5, 'sawtooth', 0.3), 300);
    },
    wasted() {
      blip(330, 165, 0.6, 'sawtooth', 0.3);
    },
    click() {
      blip(660, 660, 0.05, 'square', 0.15);
    },
    horn() {
      blip(370, 370, 0.18, 'square', 0.2);
      setTimeout(() => blip(466, 466, 0.18, 'square', 0.2), 40);
    },
  };
}
