// @ts-nocheck
/**
 * Plays a notification sound using the Web Audio API
 * Falls back gracefully if audio is not supported or disabled
 * @returns {Promise<void>}
 */
export const playNotificationSound = async () => {
  try {
    // Create a simple beep sound using Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Set frequency and duration for a pleasant notification sound
    oscillator.frequency.value = 800; // Frequency in Hz
    oscillator.type = "sine";

    // Fade in and out for a smooth sound
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);

    return Promise.resolve();
  } catch (error) {
    // Silently fail if audio context is not available or user has disabled audio
    console.debug("Notification sound not available:", error);
    return Promise.resolve();
  }
};
