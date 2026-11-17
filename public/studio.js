import { drafts } from './storage.js';

import { pictureInPicture } from './composition.js';

const el = id => document.getElementById(id);
const preview = el('preview');
const message = text => { el('status').textContent = text; };
let recorder;
let objectURL;
let busy = false;

function lock(value) {
  busy = value;
  el('fields').disabled = value;
  el('record').hidden = value;
  for (const button of el('drafts').querySelectorAll('button')) button.disabled = value;
}
function review(draft) {
  window.dispatchEvent(new CustomEvent('academy:draft', { detail: draft }));
  preview.srcObject = null;
  if (objectURL) URL.revokeObjectURL(objectURL);
  objectURL = URL.createObjectURL(draft.blob);
  preview.src = objectURL;
  preview.muted = false;
  preview.controls = true;
  preview.hidden = false;
  el('placeholder').hidden = true;
  const download = el('download');
  download.href = objectURL;
  const ext = draft.blob.type.includes('mp4') ? 'mp4' : draft.blob.type.includes('ogg') ? 'ogg' : 'webm';
  download.download = draft.title + '.' + ext;
  download.hidden = false;
}

async function refresh() {
  const list = el('drafts');
  const entries = await drafts('list');
  list.replaceChildren();
  for (const entry of entries.sort((a,b) => b.created - a.created)) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.textContent = [entry.course, entry.unit, entry.title].join(' / ');
    button.disabled = busy;
    button.onclick = async () => {
      try { const saved = await drafts('get', entry.id); if (!busy) { review(saved); message(entry.title); } }
      catch { message('Falha ao abrir a gravação.'); }
    };
    item.append(button);
    list.append(item);
  }
  if (!entries.length) list.textContent = 'Nenhuma aula gravada.';
}

el('settings').onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  const mode = el('mode').value;
  const streams = [];
  let composition;
  const release = () => {
    composition?.close();
    streams.forEach(stream => stream.getTracks().forEach(track => track.stop()));
  };
  lock(true);
  message('Aguardando permissão do navegador…');
  try {
    if (!window.MediaRecorder || !navigator.mediaDevices) throw Error('unsupported');
    if (mode === 'screen' || mode === 'combined') streams.push(await navigator.mediaDevices.getDisplayMedia({ video: true }));
    streams.push(await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === 'camera' || mode === 'combined' }));
    let capture;
    if (mode === 'combined') {
      composition = await pictureInPicture(streams[0], streams[1]);
      streams.push(composition.stream);
      capture = new MediaStream([...composition.stream.getVideoTracks(), ...streams[1].getAudioTracks()]);
    } else {
      capture = new MediaStream(streams.flatMap(stream => stream.getTracks()));
    }
    const session = new MediaRecorder(capture);
    recorder = session;
    const chunks = [];
    let failed = false;
    session.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    session.onerror = () => { failed = true; };
    session.onstop = async () => {
      release();
      el('stop').hidden = true;
      recorder = undefined;
      try {
        if (!chunks.length) { message('A gravação terminou sem dados. Grave novamente.'); return; }
        const draft = {
          id: crypto.randomUUID(), created: Date.now(), title: el('title').value,
          course: el('course').value, unit: el('unit').value,
          blob: new Blob(chunks, { type: session.mimeType || chunks[0].type })
        };
        review(draft);
        await drafts('save', draft);
        await refresh();
        message(failed ? 'Gravação interrompida. Revise o trecho recuperado.' : 'Rascunho salvo. Revise a aula ou baixe uma cópia.');
      } catch { message('Falha ao salvar no navegador. Baixe a gravação antes de sair.'); }
      finally { lock(false); }
    };
    streams.flatMap(stream => stream.getTracks()).forEach(track => track.addEventListener('ended', () => {
      if (session.state !== 'inactive') session.stop();
    }));
    session.start(1000);
    preview.removeAttribute('src');
    preview.srcObject = capture;
    preview.controls = false;
    preview.muted = true;
    preview.hidden = mode === 'audio';
    el('placeholder').hidden = mode !== 'audio';
    el('placeholder').textContent = 'Gravando áudio';
    preview.play().catch(() => {});
    el('download').hidden = true;
    el('stop').hidden = false;
    message('Gravação em andamento. Mantenha esta aba aberta.');
  } catch (error) {
    release();
    recorder = undefined;
    lock(false);
    message(error.name === 'NotAllowedError' ? 'Permissão negada ou seleção cancelada. Tente novamente.' : 'Não foi possível iniciar. Verifique os dispositivos e o suporte do navegador.');
  }
};
el('stop').onclick = () => { if (recorder?.state === 'recording') recorder.stop(); };
window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });

const brand = await fetch('/api/academy').then(response => response.json());
el('brand').textContent = brand.name;
document.title = 'Estúdio | ' + brand.name;
document.documentElement.style.setProperty('--brand', brand.color);
refresh().catch(() => message('Armazenamento local indisponível. Você ainda pode baixar a gravação.'));
