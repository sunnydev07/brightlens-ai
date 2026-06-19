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
    requestScreenCapture?: () => void;
    closeApp?: () => void;
    minimizeApp?: () => void;
    maximizeApp?: () => void;
    getBackendPort?: () => Promise<number>;
    getSecureKeys?: () => Promise<{ gemini?: string; openrouter?: string; nvidia?: string }>;
    saveSecureKeys?: (keys: { gemini?: string; openrouter?: string; nvidia?: string }) => Promise<{ success: boolean; error?: string }>;
  };
}
