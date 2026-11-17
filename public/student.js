const status=document.getElementById('student-status');
const root=document.getElementById('student-courses');
let playing;
let saves=Promise.resolve();
function text(tag,value) {
  const element=document.createElement(tag);element.textContent=value;return element;
}
function play(lesson) {
  playing?.pause();
  const player=document.getElementById('player');
  const video=document.createElement('video');
  video.controls=true;
  video.playsInline=true;
  video.src='/api/student/lessons/'+lesson.id+'/media';
  playing=video;
  const complete=document.createElement('button');
  complete.textContent=lesson.completed?'Aula concluída':'Marcar como concluída';
  let lastSaved=0;
  function save(completed=false) {
    if(!Number.isFinite(video.currentTime))return;
    const data={seconds:video.currentTime,completed:completed||!!lesson.completed};

    // Keep saves in order even when pause, completion and switching lessons happen together.
    saves=saves.catch(()=>{}).then(async()=>{
      const response=await fetch('/api/student/lessons/'+lesson.id+'/progress',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),keepalive:true
      });
      if(!response.ok) {status.textContent='Não foi possível salvar o progresso. Confira seu acesso e conexão.';return;}
      lesson.seconds=data.seconds;
      lesson.completed=Math.max(lesson.completed,Number(data.completed));
      if(lesson.completed)complete.textContent='Aula concluída';
      status.textContent='Progresso salvo.';
    }).catch(()=>{status.textContent='Conexão indisponível. O progresso ainda não foi salvo.';});
  }
  video.onloadedmetadata=()=>{
    if(lesson.seconds>0)video.currentTime=lesson.seconds;
  };
  video.ontimeupdate=()=>{
    if(Date.now()-lastSaved>10000 && !video.paused) {lastSaved=Date.now();save();}
  };
  video.onpause=()=>save();
  video.onended=()=>save(true);
  video.onerror=()=>{status.textContent='A aula está indisponível. Confira seu acesso ou tente novamente.';};
  complete.onclick=()=>save(true);
  player.replaceChildren(text('h2',lesson.title),video,text('p',lesson.description),complete);
  for(const file of lesson.attachments??[]) {
    const link=document.createElement('a');link.textContent=file.name;
    link.href='/api/student/lessons/'+lesson.id+'/attachments/'+file.id;
    const row=document.createElement('p');row.append(link);player.append(row);
  }
}
async function load() {
  const brand=await (await fetch('/api/academy')).json();
  document.getElementById('brand').textContent=brand.name;
  document.documentElement.style.setProperty('--brand',brand.color);
  const response=await fetch('/api/student/courses');
  if(!response.ok){status.textContent=response.status===401?'Entre para acessar seus cursos.':'Não foi possível carregar seus cursos.';return;}
  const courses=await response.json();
  root.replaceChildren();
  for(const course of courses) {
    const section=document.createElement('section');section.className='course';
    section.append(text('h2',course.title),text('p',course.description));
    const lessons=course.modules.flatMap(module=>module.lessons);
    const completed=lessons.filter(lesson=>lesson.completed).length;
    section.append(text('p',completed+' de '+lessons.length+' aulas concluídas'));
    const next=lessons.find(lesson=>!lesson.completed)??lessons[0];
    if(next){
      const resume=document.createElement('button');resume.textContent='Continuar curso';
      resume.onclick=()=>play(lessons.find(lesson=>!lesson.completed)??lessons[0]);section.append(resume);
    }
    for(const module of course.modules) {
      section.append(text('h3',module.title));
      for(const lesson of module.lessons) {
        const button=document.createElement('button');
        button.textContent=lesson.title+(lesson.completed?' — concluída':'');
        button.onclick=()=>play(lesson);section.append(button);
      }
    }
    root.append(section);
  }
  if(!courses.length) status.textContent='Você ainda não tem cursos liberados nesta academia.';
}
load().catch(()=>{status.textContent='Não foi possível carregar. Tente novamente.';});
