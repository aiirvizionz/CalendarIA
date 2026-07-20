const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_TARGET_BYTES = 1.6 * 1024 * 1024;
const IMAGE_MAX_DIMENSION = 1600;
const AUDIO_MAX_DURATION_MS = 60_000;
const AUDIO_TARGET_SAMPLE_RATE = 16_000;

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

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function optimizeImage(file) {
  if (typeof createImageBitmap !== 'function') return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / longestSide);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    if (scale === 1 && file.size <= IMAGE_TARGET_BYTES) return file;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);

    const outputType = file.type === 'image/png' ? 'image/webp' : file.type;
    const optimized = await canvasToBlob(canvas, outputType, outputType === 'image/png' ? undefined : 0.82);
    if (!optimized || optimized.size >= file.size) return file;
    return optimized;
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}

export async function readImage(file) {
  if (!file || !IMAGE_TYPES.has(file.type)) {
    throw new Error('Selecciona una imagen JPG, PNG o WebP');
  }
  if (!file.size || file.size > IMAGE_MAX_BYTES) {
    throw new Error('La imagen debe pesar 4 MB o menos');
  }

  const optimized = await optimizeImage(file);
  if (!optimized.size || optimized.size > IMAGE_MAX_BYTES) {
    throw new Error('La imagen optimizada supera el tamaño permitido');
  }

  const mimeType = IMAGE_TYPES.has(optimized.type) ? optimized.type : file.type;
  const sizeKb = Math.max(1, Math.round(optimized.size / 1024));
  return {
    mimeType,
    data: await blobToBase64(optimized),
    previewUrl: URL.createObjectURL(optimized),
    description: `${file.name} · ${sizeKb} KB`,
  };
}

function mergeFloat32Chunks(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function downsampleAudio(samples, sourceRate, targetRate = AUDIO_TARGET_SAMPLE_RATE) {
  if (!samples.length || !Number.isFinite(sourceRate) || sourceRate <= targetRate) return samples;
  const ratio = sourceRate / targetRate;
  const outputLength = Math.max(1, Math.floor(samples.length / ratio));
  const output = new Float32Array(outputLength);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(samples.length, Math.floor((outputIndex + 1) * ratio));
    let sum = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) sum += samples[inputIndex];
    output[outputIndex] = sum / Math.max(1, end - start);
  }

  return output;
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function encodeWav(samples, sampleRate) {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    const pcm = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, pcm, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export async function startAudioCapture() {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined' || typeof AudioWorkletNode === 'undefined') {
    throw new Error('Tu navegador no permite grabar audio compatible desde esta página');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const audioContext = new AudioContext();
  const sourceSampleRate = audioContext.sampleRate;
  const chunks = [];
  let stopped = false;
  let timer = null;

  try {
    await audioContext.audioWorklet.addModule('/js/pcm-recorder-worklet.js');
    await audioContext.resume();
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    await audioContext.close().catch(() => {});
    throw new Error('No se pudo preparar la captura de audio');
  }

  const source = audioContext.createMediaStreamSource(stream);
  const recorder = new AudioWorkletNode(audioContext, 'pcm-recorder');
  const silentOutput = audioContext.createGain();
  silentOutput.gain.value = 0;
  recorder.port.onmessage = (event) => {
    if (!stopped && event.data instanceof Float32Array && event.data.length) chunks.push(event.data);
  };

  source.connect(recorder);
  recorder.connect(silentOutput);
  silentOutput.connect(audioContext.destination);

  let resolveResult;
  let rejectResult;
  const result = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  async function finish() {
    if (stopped) return;
    stopped = true;
    if (timer) window.clearTimeout(timer);

    try {
      source.disconnect();
      recorder.disconnect();
      silentOutput.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      await audioContext.close();

      const samples = mergeFloat32Chunks(chunks);
      if (samples.length < sourceSampleRate / 4) {
        throw new Error('La grabación fue demasiado corta para analizar');
      }

      const optimizedSamples = downsampleAudio(samples, sourceSampleRate, AUDIO_TARGET_SAMPLE_RATE);
      const blob = encodeWav(optimizedSamples, Math.min(sourceSampleRate, AUDIO_TARGET_SAMPLE_RATE));
      resolveResult({
        mimeType: 'audio/wav',
        data: await blobToBase64(blob),
      });
    } catch (error) {
      rejectResult(error);
    }
  }

  timer = window.setTimeout(finish, AUDIO_MAX_DURATION_MS);

  return {
    result,
    stop: finish,
  };
}
