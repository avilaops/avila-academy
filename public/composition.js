// A câmera aparece no canto inferior direito dos slides gravados.
export async function pictureInPicture(screen, camera) {
  const sources = [screen, camera].map(stream => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    return video;
  });
  let timer;
  const close = () => {
    clearInterval(timer);
    sources.forEach(video => { video.pause(); video.srcObject = null; });
  };
  try {
    await Promise.all(sources.map(video => video.play()));
    const canvas = document.createElement('canvas');
    const [slides, speaker] = sources;
    canvas.width = Math.min(slides.videoWidth, 1600);
    canvas.height = Math.max(2, Math.round(canvas.width * slides.videoHeight / slides.videoWidth / 2) * 2);
    const ctx = canvas.getContext('2d');
    const draw = () => {
      ctx.drawImage(slides, 0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width * .24 / speaker.videoWidth, canvas.height * .30 / speaker.videoHeight);
      const w = speaker.videoWidth * scale;
      const h = speaker.videoHeight * scale;
      ctx.drawImage(speaker, canvas.width - w - 12, canvas.height - h - 12, w, h);
    };
    draw();
    timer = setInterval(draw, 1000 / 24);
    return { stream: canvas.captureStream(24), close };
  } catch (error) { close(); throw error; }
}
