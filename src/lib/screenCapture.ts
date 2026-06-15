/**
 * Capture a still frame from an Electron desktop-capturer source id and return
 * it as a PNG data URL. Preserves the original `chromeMediaSource` + ImageCapture
 * pipeline and always stops the underlying track.
 */
export async function captureFrameFromSource(sourceId: string): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
      },
    } as unknown as MediaTrackConstraints,
  })

  try {
    const track = stream.getVideoTracks()[0]
    const imageCapture = new ImageCapture(track)
    const bitmap = await imageCapture.grabFrame()

    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
    return canvas.toDataURL('image/png')
  } finally {
    stream.getTracks().forEach((track) => track.stop())
  }
}
