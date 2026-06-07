// @ts-nocheck
let sharedAudioContext = null;

async function resolveAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === "suspended") {
    try {
      await sharedAudioContext.resume();
    } catch {
      return null;
    }
  }
  return sharedAudioContext.state === "running" ? sharedAudioContext : null;
}

/**
 * Plays a notification sound using the Web Audio API.
 * Respects browser autoplay policy by resuming a shared AudioContext when needed.
 */
export const playNotificationSound = async ({ enabled = true } = {}) => {
  if (enabled === false) return;
  try {
    const audioContext = await resolveAudioContext();
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";

    const startAt = audioContext.currentTime;
    gainNode.gain.setValueAtTime(0, startAt);
    gainNode.gain.linearRampToValueAtTime(0.3, startAt + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, startAt + 0.2);

    oscillator.start(startAt);
    oscillator.stop(startAt + 0.2);
  } catch (error) {
    console.debug("Notification sound not available:", error);
  }
};

/** Call once after a user gesture so later notification sounds can play. */
export const unlockNotificationSound = () => {
  resolveAudioContext().catch(() => {});
};
