/// <reference types="vite/client" />

interface ImageCapture {
  grabFrame(): Promise<ImageBitmap>;
}

interface ImageBitmap {
  width: number;
  height: number;
}

interface ElectronScreenCaptureSource {
  id: string;
}

interface Window {
  electronAPI?: {
    onScreenCapture: (callback: (event: unknown, source: ElectronScreenCaptureSource) => void) => void;
    captureDone?: () => void;
  };
}
