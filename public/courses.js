const root=document.getElementById('catalog');
const status=document.getElementById('catalog-status');
const form=document.getElementById('create-course');
async function api(path,method='GET',data) {
  const response=await fetch('/api/courses'+path,{method,headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  if(!response.ok) throw Error(response.status===401?'Entre com sua conta para organizar os cursos.':'Não foi possível salvar. Confira os dados e tente novamente.');
  return response.json();
}
function input(label,value='',multiline=false) {
  const wrapper=document.createElement('label');
  wrapper.textContent=label;
  const field=document.createElement(multiline?'textarea':'input');
  field.value=value;field.required=!multiline;field.maxLength=multiline?10000:160;
  wrapper.append(field);
  return {wrapper,field};
}
function button(label,action) {
  const element=document.createElement('button');
  element.type='button';element.textContent=label;
  element.onclick=async()=>{
    element.disabled=true;
    try {await action();await refresh();status.textContent='Catálogo atualizado.';}
    catch(error){status.textContent=error.message;}
    finally {element.disabled=false;}
  };
  return element;
}
function heading(tag,text) {
  const element=document.createElement(tag);element.textContent=text;return element;
}
function creation(label,action) {
  const form=document.createElement('form');
  const {wrapper,field}=input(label);
  const submit=document.createElement('button');submit.textContent='Adicionar';
  form.append(wrapper,submit);
  form.onsubmit=async event=>{
    event.preventDefault();submit.disabled=true;
    try {await action(field.value);await refresh();status.textContent='Catálogo atualizado.';}
    catch(error){status.textContent=error.message;}
    finally {submit.disabled=false;}
  };
  return form;
}
async function materialPanel(lesson) {
  const panel=document.createElement('section');
  panel.append(heading('h5','Materiais da aula'));
  const endpoint='/api/attachments/'+lesson.id;
  const response=await fetch(endpoint);
  if(!response.ok)throw Error('Não foi possível carregar os materiais.');
  for(const file of await response.json()) {
    const row=document.createElement('p');
    const link=document.createElement('a');
    link.href=endpoint+'/'+file.id;link.textContent=file.name;
    row.append(link,button('Remover material',async()=>{
      const result=await fetch(endpoint+'/'+file.id,{method:'DELETE'});
      if(!result.ok)throw Error('Não foi possível remover o material.');
    }));
    panel.append(row);
  }
  const upload=document.createElement('form');
  const label=document.createElement('label');label.textContent='Adicionar material (até 25 MiB)';
  const file=document.createElement('input');file.type='file';file.required=true;
  file.accept='.pdf,.png,.jpg,.jpeg,.txt,.zip';
  let uploadId=crypto.randomUUID();
  file.onchange=()=>{uploadId=crypto.randomUUID();};
  const submit=document.createElement('button');submit.textContent='Enviar material';
  label.append(file);upload.append(label,submit);panel.append(upload);
  upload.onsubmit=async event=>{
    event.preventDefault();
    const selected=file.files[0];
    if(!selected||!selected.size||selected.size>25*1024*1024){status.textContent='Escolha um material de até 25 MiB.';return;}
    submit.disabled=true;
    try {
      const result=await fetch(endpoint+'?name='+encodeURIComponent(selected.name),{
        method:'POST',headers:{'Content-Type':selected.type,'X-Upload-Id':uploadId},body:selected
      });
      if(!result.ok)throw Error('Não foi possível enviar. Use PDF, PNG, JPEG, TXT ou ZIP.');
      await refresh();status.textContent='Material adicionado.';
    }catch(error){status.textContent=error.message;}
    finally{submit.disabled=false;}
  };
  return panel;
}
async function refresh() {
  const courses=await api('');
  const response=await fetch('/api/recordings');
  if(!response.ok) throw Error('Não foi possível carregar as gravações.');
  const recordings=(await response.json()).filter(record=>record.state==='ready');
  const enrollmentResponse=await fetch('/api/enrollments');
  if(!enrollmentResponse.ok)throw Error('Não foi possível carregar as matrículas.');
  const enrollments=await enrollmentResponse.json();
  root.replaceChildren();
  for(const course of courses) {
    const section=document.createElement('section');
    section.className='course';
    section.append(heading('h3',course.title));
    const title=input('Nome do curso',course.title);
    const description=input('Descrição',course.description,true);
    section.append(title.wrapper,description.wrapper,button('Salvar curso',()=>api('/'+course.id,'PATCH',{title:title.field.value,description:description.field.value})));
    for(const [index,module] of course.modules.entries()){
      const unit=document.createElement('article');
      unit.append(heading('h4',module.title));
      const name=input('Nome do módulo',module.title);
      unit.append(name.wrapper,button('Salvar módulo',()=>api('/'+module.id,'PATCH',{title:name.field.value})));
      if(index>0) unit.append(button('Mover módulo para cima',async()=>{
        // Ordered positions are assigned in one request in the API.
        await api('/'+course.id+'/reorder','POST',{ids:course.modules.map(item=>item.id).toSpliced(index-1,2,module.id,course.modules[index-1].id)});
      }));
      for(const lesson of module.lessons) {
        const row=document.createElement('div');
        const label=input('Título da aula',lesson.title);
        row.append(label.wrapper,button('Salvar título',()=>api('/'+lesson.id,'PATCH',{title:label.field.value})),
          button(lesson.published?'Voltar para rascunho':'Marcar como publicada',()=>api('/'+lesson.id,'PATCH',{published:!lesson.published})));
        row.append(heading('p',lesson.published?'Publicada':'Rascunho'));
        row.append(await materialPanel(lesson));
        unit.append(row);
      }
      if(recordings.length){
        const add=document.createElement('form');
        const label=document.createElement('label');label.textContent='Gravação para adicionar como aula';
        const select=document.createElement('select');
        for(const record of recordings){
          const option=document.createElement('option');option.value=record.id;option.textContent=record.title;select.append(option);
        }
        const submit=document.createElement('button');submit.textContent='Adicionar aula';label.append(select);add.append(label,submit);
        add.onsubmit=async event=>{
          event.preventDefault();submit.disabled=true;
          try {const record=recordings.find(item=>item.id===select.value);await api('/'+module.id+'/lessons','POST',{recordingId:record.id,title:record.title});await refresh();}
          catch(error){status.textContent=error.message;}finally{submit.disabled=false;}
        };
        unit.append(add);
      }
      section.append(unit);
    }
    section.append(creation('Novo módulo',title=>api('/'+course.id+'/modules','POST',{title})));
    section.append(heading('h4','Alunos'));
    section.append(creation('Identificador do aluno no Ávila Ops',async subject=>{
      const response=await fetch('/api/enrollments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseId:course.id,subject})});
      if(!response.ok)throw Error('Não foi possível liberar o curso.');
    }));
    for(const enrollment of enrollments.filter(item=>item.course_id===course.id)){
      const row=document.createElement('p');
      row.textContent=enrollment.subject+(enrollment.active?' — acesso ativo':' — acesso revogado');
      row.append(button(enrollment.active?'Revogar acesso':'Reativar acesso',async()=>{
        const response=await fetch('/api/enrollments/'+enrollment.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:!enrollment.active})});
        if(!response.ok)throw Error('Não foi possível alterar o acesso.');
      }));
      section.append(row);
    }
    root.append(section);
  }
  if(!courses.length)root.textContent='Nenhum curso cadastrado.';
}
form.onsubmit=async event=>{
  event.preventDefault();
  const submit=form.querySelector('button');
  submit.disabled=true;
  try {await api('','POST',{title:document.getElementById('new-course').value});form.reset();await refresh();}
  catch(error){status.textContent=error.message;}finally{submit.disabled=false;}
};
refresh().catch(error=>{status.textContent=error.message;});
