const DEFAULT_DURATION_MS = 15400;
const CAPTURE_ENDPOINT = 'http://127.0.0.1:8082/capture';

function preferredMimeType() {
  const types = [
    'video/webm;codecs=vp8',
    'video/webm;codecs=vp9',
    'video/webm',
  ];
  return types.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function waitForGameplay(game) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const poll = () => {
      const scene = game.scene?.getScene?.('Game');
      if (scene?.mainSkillChosen && scene.ui && !scene.paused && !scene.over) {
        resolve(scene);
        return;
      }
      if (performance.now() - startedAt > 15000) {
        reject(new Error('Gameplay did not become ready for capture'));
        return;
      }
      requestAnimationFrame(poll);
    };
    poll();
  });
}

export async function installVideoCapture(game) {
  const params = new URLSearchParams(window.location.search);
  const durationMs = Math.max(3000, Number(params.get('captureDuration')) || DEFAULT_DURATION_MS);
  const name = (params.get('captureName') || 'horde-spark-portrait-gameplay')
    .replace(/[^a-z0-9_-]+/gi, '-');
  window.__videoCaptureStatus = { state: 'waiting' };
  document.getElementById('game-version')?.remove();

  try {
    await waitForGameplay(game);
    // 让首轮怪群与特效先进入画面，避免录到加载/选择过渡。
    await new Promise(resolve => setTimeout(resolve, 3200));

    const canvas = game.canvas;
    const stream = canvas.captureStream(60);
    const mimeType = preferredMimeType();
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 8_000_000,
    });
    const chunks = [];
    recorder.addEventListener('dataavailable', event => {
      if (event.data?.size) chunks.push(event.data);
    });

    window.__videoCaptureStatus = {
      state: 'recording',
      durationMs,
      width: canvas.width,
      height: canvas.height,
      mimeType: mimeType || 'browser-default',
    };
    recorder.start(1000);
    await new Promise(resolve => setTimeout(resolve, durationMs));
    await new Promise((resolve, reject) => {
      recorder.addEventListener('stop', resolve, { once: true });
      recorder.addEventListener('error', event => reject(event.error), { once: true });
      recorder.stop();
    });
    stream.getTracks().forEach(track => track.stop());

    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    const response = await fetch(`${CAPTURE_ENDPOINT}?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      body: blob,
    });
    if (!response.ok) throw new Error(`Capture upload failed (${response.status})`);
    const result = await response.json();
    window.__videoCaptureStatus = { state: 'complete', ...result };
  } catch (error) {
    window.__videoCaptureStatus = { state: 'error', message: error?.message || String(error) };
    console.error('[video-capture]', error);
  }
}
