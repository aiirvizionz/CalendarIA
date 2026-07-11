const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const AUDIO_MAX_DURATION_MS = 60_000;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = () => {
      const value = String(reader.result || '');
      const separator = value.indexOf(',');
      if (separator < 0) return reject(new Error('El archivo no pudo convertirse'));
      return resolve(value.slice(separator + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export async function readImage(file) {
  if (!file || !IMAGE_TYPES.has(file.type)) {
    throw new Error('Selecciona una imagen JPG, PNG o WebP');
  }
  if (!file.size || file.size > IMAGE_MAX_BYTES) {
    throw new Error('La imagen debe pesar 4 MB o menos');
  }

  return {
    mimeType: file.type,
    data: await blobToBase64(file),
    previewUrl: URL.createObjectURL(file),
  };
}

function supportedAudioMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export async function startAudioCapture() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Tu navegador no permite grabar audio desde esta página');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = supportedAudioMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks = [];
  let stopped = false;
  let timer = null;

  const cleanup = () => {
    stream.getTracks().forEach((track) => track.stop());
    if (timer) window.clearTimeout(timer);
  };

  const result = new Promise((resolve, reject) => {
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) chunks.push(event.data);
    });
    recorder.addEventListener('error', () => {
      cleanup();
      reject(new Error('La grabación de audio falló'));
    });
    recorder.addEventListener('stop', async () => {
      cleanup();
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        if (!blob.size) throw new Error('No se detectó audio para analizar');
        resolve({
          mimeType: blob.type.split(';')[0],
          data: await blobToBase64(blob),
        });
      } catch (error) {
        reject(error);
      }
    });
  });

  recorder.start(250);
  timer = window.setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  }, AUDIO_MAX_DURATION_MS);

  return {
    result,
    stop() {
      if (stopped) return;
      stopped = true;
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}
