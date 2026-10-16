import type { ArcanistPlayer } from "./player";
import { isOled, settings } from "../settings";

// The aura around Webamp's windows in OLED mode: a violet glow that breathes with the music's level and flashes gold
// on the beats. It reads Webamp's own analyser (the one its visualizer uses), sets --aura and --aura-kick on #webamp
// (styles.css draws the glow) and sleeps while nothing plays. With reduced motion it only follows the level, slowly,
// without the flashes: the glow changes, nothing moves.

const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");

export function startAura(player: ArcanistPlayer): void {
  let frame = 0;
  let level = 0;
  let kick = 0;
  let average = 0;
  let bins: Uint8Array | null = null;
  let wave: Uint8Array | null = null;

  const root = () => document.getElementById("webamp");
  const playing = () => player.webamp.store.getState().media.status === "PLAYING";

  const set = (aura: number, beat: number) => {
    const node = root();
    if (!node) return;
    node.style.setProperty("--aura", aura.toFixed(3));
    node.style.setProperty("--aura-kick", beat.toFixed(3));
  };

  const tick = () => {
    frame = 0;
    const analyser = player.webamp.media.getAnalyser();
    bins ??= new Uint8Array(analyser.frequencyBinCount);
    wave ??= new Uint8Array(analyser.fftSize);
    let bass = 0;
    let all = 0;
    if (playing()) {
      // The level: the signal's RMS. The beat: the energy at about 20–250 Hz.
      analyser.getByteTimeDomainData(wave);
      for (const sample of wave) all += ((sample - 128) / 128) ** 2;
      all = Math.sqrt(all / wave.length);
      analyser.getByteFrequencyData(bins);
      for (let i = 1; i < 12; i++) bass += bins[i];
      bass /= 11 * 255;
    }
    // Quick to rise, slow to fall, so it breathes rather than flickers.
    const calm = reducedMotion?.matches ?? false;
    const target = Math.min(1, all * 2.6);
    level += (target - level) * (calm ? 0.03 : target > level ? 0.35 : 0.06);
    average += (bass - average) * 0.02;
    kick = !calm && bass > average * 1.35 && bass > 0.35 ? 1 : kick * 0.9;
    set(level, kick);
    if (playing() || level > 0.01 || kick > 0.01) frame = requestAnimationFrame(tick);
    else set(0, 0);
  };

  const update = () => {
    const node = root();
    const on = isOled();
    node?.classList.toggle("aura", on);
    if (!on) {
      cancelAnimationFrame(frame);
      frame = 0;
      set(0, 0);
      return;
    }
    if (!frame && playing()) frame = requestAnimationFrame(tick);
  };

  settings.subscribe(update);
  player.webamp.__onStateChange(update);
  reducedMotion?.addEventListener("change", update);
  update();
}
