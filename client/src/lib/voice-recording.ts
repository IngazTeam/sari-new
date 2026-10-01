/** Browser recording capabilities; the standalone prototype supplies a synthetic adapter. */
export const voiceRecording = {
  capture: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }),
  supports: (mimeType: string) => MediaRecorder.isTypeSupported(mimeType),
  create: (stream: MediaStream, mimeType: string) => new MediaRecorder(stream, { mimeType }),
};
