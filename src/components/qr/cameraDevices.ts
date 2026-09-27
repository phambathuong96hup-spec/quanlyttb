// Call only after the scanner has obtained camera permission. Opening a second
// capture stream just to enumerate devices can interrupt the preview on iOS.
export async function listGrantedCameras(media: {
  enumerateDevices(): Promise<Array<{ kind: string; deviceId: string; label: string }>>;
}) {
  const devices = await media.enumerateDevices();
  return devices.filter(device => device.kind === 'videoinput')
    .map(device => ({ id: device.deviceId, label: device.label }));
}
