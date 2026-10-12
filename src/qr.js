// QR scanning with the browser's own BarcodeDetector (Chrome on Android has
// it). No library: where it is missing, the page says so and offers paste
// and upload instead.
export const canScan = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

/** Scans from the rear camera until a QR code is read (-> its text) or the signal aborts (-> null). */
export async function scanCamera(video, signal) {
  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  try {
    video.srcObject = stream;
    await video.play();
    while (!signal.aborted) {
      const codes = await detector.detect(video).catch(() => []);
      if (codes.length) return codes[0].rawValue;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}
