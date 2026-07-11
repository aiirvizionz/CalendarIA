class PcmRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input?.length || !input[0]?.length) return true;

    const mono = input.length === 1
      ? input[0]
      : input[0].map((sample, index) => {
        let sum = 0;
        for (const channel of input) sum += channel[index] || 0;
        return sum / input.length;
      });

    this.port.postMessage(new Float32Array(mono));
    return true;
  }
}

registerProcessor('pcm-recorder', PcmRecorderProcessor);
