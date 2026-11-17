import {syncDraft} from './upload.js';
import { drafts } from './storage.js';

import { pictureInPicture } from './composition.js';

const el = id => document.getElementById(id);
const preview = el('preview');
const message = text => { el('status').textContent = text; };
let recorder;
let objectURL;
let busy = false;
let prepared;
let preparing = false;
let activeCapture;

function lock(value) {
  busy = value;
  el('fields').disabled = value;
  el('live-upload').disabled = value;
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
    if(entry.captureComplete===false && entry.bytes>0){
      const recover=document.createElement('button');
      recover.textContent='Finalizar trecho recuperado: '+entry.title;
      recover.disabled=busy;
      recover.onclick=async()=>{
        try{
          await drafts('patch',{id:entry.id,changes:{captureComplete:true}});
          review(await drafts('get',entry.id));await refresh();
          message('Trecho recuperado. Confira a reprodução e baixe uma cópia.');
        }catch{message('Não foi possível recuperar o trecho.');}
      };
      item.append(recover);
    }
    const button = document.createElement('button');
    button.textContent = [entry.course, entry.unit, entry.title].join(' / ')+(entry.captureComplete===false?' — trecho parcial':'');
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

async function prepareCapture() {
  if (busy) return;
  preparing = true;
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

    let audio;
    let frame;
    try {
      audio = new AudioContext();
      const source = audio.createMediaStreamSource(capture);
      const analyser = audio.createAnalyser();
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const measure = () => {
        analyser.getByteTimeDomainData(samples);
        const amplitude = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
        el('audio-level').value = Math.min(1, amplitude * 4);
        frame = requestAnimationFrame(measure);
      };
      await audio.resume();
      measure();
    } catch { message('Prévia pronta. Indicador de áudio indisponível neste navegador.'); }
    const cleanup = () => {
      cancelAnimationFrame(frame);
      if (audio && audio.state !== 'closed') audio.close().catch(() => {});
      el('audio-level').value = 0;
      release();
    };
    prepared = {capture, mode, streams, release: cleanup};
    streams.flatMap(stream => stream.getTracks()).forEach(track => track.addEventListener('ended', () => {
      if (!recorder && !preparing) cancelPreview();
    }));
    preview.removeAttribute('src');
    preview.srcObject = capture;
    preview.controls = false;
    preview.muted = true;
    preview.hidden = mode === 'audio';
    el('placeholder').hidden = mode !== 'audio';
    el('placeholder').textContent = 'Teste o microfone pelo indicador de áudio';
    preview.play().catch(() => {});
    el('fields').disabled = false;
    el('live-upload').disabled = false;
    el('mode').disabled = true;
    el('record').hidden = false;
    el('cancel-preview').hidden = false;
    el('prepare').hidden = true;
    el('download').hidden = true;
    message('Prévia pronta. Confira a imagem e fale para testar o microfone.');
  } catch (error) {
    release();
    lock(false);
    message(error.name === 'NotAllowedError' ? 'Permissão negada ou seleção cancelada. Tente novamente.' : 'Não foi possível iniciar. Verifique os dispositivos e o suporte do navegador.');
  } finally { preparing = false; }
}

function cancelPreview() {
  if (recorder || preparing) return;
  const previous = prepared;
  prepared = undefined;
  previous?.release();
  preview.srcObject = null;
  preview.hidden = true;
  el('placeholder').hidden = false;
  el('placeholder').textContent = 'Prévia da gravação';
  el('cancel-preview').hidden = true;
  el('prepare').hidden = false;
  el('mode').disabled = false;
  lock(false);
  message('Prévia encerrada. Câmera e microfone liberados.');
}
el('import-media').onchange = async event => {
  const file = event.target.files[0];
  if (!file || busy) return;
  if (!/^(video|audio)\/(mp4|webm|ogg)$/.test(file.type) || file.size === 0 || file.size > 1024 ** 3) {
    message('Escolha um arquivo MP4, WebM ou Ogg válido, de até 1 GiB.');
    event.target.value = '';
    return;
  }
  if (!el('title').value.trim()) el('title').value = file.name.replace(/\.[^.]+$/, '').slice(0, 160);
  if (!el('settings').reportValidity()) { event.target.value = ''; return; }
  lock(true);
  try {
    const draft = {
      id: crypto.randomUUID(), created: Date.now(), title: el('title').value,
      course: el('course').value, unit: el('unit').value, blob: file
    };
    review(draft);
    await drafts('save', draft);
    await refresh();
    message('Aula importada. Revise e salve no servidor quando estiver pronta.');
  } catch { message('Falha ao importar no navegador. Confira o espaço disponível.'); }
  finally { event.target.value = ''; lock(false); }
};
el('prepare').onclick = prepareCapture;
el('cancel-preview').onclick = cancelPreview;

el('settings').onsubmit = async event => {
  event.preventDefault();
  if (recorder || preparing) return;
  if (!prepared) await prepareCapture();
  if (!prepared) return;
  const {capture, mode, streams, release} = prepared;
  lock(true);
  el('cancel-preview').hidden = true;
  try {
    const session = new MediaRecorder(capture);
    recorder = session;
    const id=crypto.randomUUID();
    const live=el('live-upload').checked;
    const metadata={
      id,created:Date.now(),title:el('title').value,course:el('course').value,unit:el('unit').value,
      mime:session.mimeType,bytes:0,localChunks:0,partSize:256*1024,captureComplete:false
    };
    await drafts('save',metadata);
    activeCapture=live?id:undefined;
    const upload=()=>syncDraft(id).catch(error=>{
      window.dispatchEvent(new CustomEvent('academy:sync-status',{detail:error.message}));
    });
    let writing=Promise.resolve();
    let failed=false;
    const unsaved=[];
    session.ondataavailable=event=>{
      if(!event.data.size)return;
      writing=writing.then(async()=>{
        if(failed){unsaved.push(event.data);return;}
        try{
          await drafts('append',{id,blob:event.data});
          if(live)void upload();
        }catch{
          failed=true;unsaved.push(event.data);
          if(session.state!=='inactive')session.stop();
        }
      });
    };
    session.onerror=()=>{failed=true;};
    session.onstop=async()=>{
      prepared=undefined;
      release();
      el('mode').disabled=false;
      el('prepare').hidden=false;
      el('stop').hidden=true;
      el('pause').hidden=true;
      recorder=undefined;
      message('Salvando o rascunho…');
      try{
        await writing;
        let draft=await drafts('get',id);
        if(unsaved.length){
          draft={...draft,blob:new Blob([draft.blob,...unsaved],{type:session.mimeType})};
          review(draft);
          message('Armazenamento local cheio. Baixe a gravação antes de sair.');
          return;
        }
        await drafts('patch',{id,changes:{captureComplete:true}});
        draft={...draft,captureComplete:true};
        if(!draft.blob.size){message('A gravação terminou sem dados. Grave novamente.');return;}
        review(draft);
        await refresh();
        message(failed?'Gravação interrompida. Revise o trecho recuperado.':'Rascunho salvo. Revise a aula ou baixe uma cópia.');
        if(live)void upload();
      }catch{message('Não foi possível finalizar. Reabra o trecho parcial nos rascunhos.');}
      finally{activeCapture=undefined;lock(false);}
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
    el('pause').hidden = false;
    el('pause').textContent = 'Pausar gravação';
    message('Gravação em andamento. Mantenha esta aba aberta.');
  } catch (error) {
    prepared = undefined;
    release();
    el('mode').disabled = false;
    el('prepare').hidden = false;
    recorder = undefined;
    lock(false);
    message(error.name === 'NotAllowedError' ? 'Permissão negada ou seleção cancelada. Tente novamente.' : 'Não foi possível iniciar. Verifique os dispositivos e o suporte do navegador.');
  }
};
el('pause').onclick = () => {
  if (recorder?.state === 'recording') {
    recorder.pause();
    el('pause').textContent = 'Continuar gravação';
    message('Gravação pausada. A prévia continua ativa.');
  } else if (recorder?.state === 'paused') {
    recorder.resume();
    el('pause').textContent = 'Pausar gravação';
    message('Gravação em andamento. Mantenha esta aba aberta.');
  }
};
el('stop').onclick = () => { if (recorder && recorder.state !== 'inactive') recorder.stop(); };
window.addEventListener('online',()=>{
  if(activeCapture)syncDraft(activeCapture).catch(()=>{});
});
window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });

const brand = await fetch('/api/academy').then(response => response.json());
el('brand').textContent = brand.name;
document.title = 'Estúdio | ' + brand.name;
document.documentElement.style.setProperty('--brand', brand.color);
refresh().catch(() => message('Armazenamento local indisponível. Você ainda pode baixar a gravação.'));
