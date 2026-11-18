# Roadmap do Ávila Academy

## 1. Estúdio local — implementado

- Seleção da marca por domínio local, com Abraão e uma segunda academia de demonstração.
- Captura de câmera, tela, composição de tela com câmera ou áudio.
- Rascunho associado a curso, módulo e título, reprodução e download.

## 2. Piloto com persistência e contas — em andamento

- Implementado o cliente OIDC/PKCE e a autorização de produtores por subject. Cliente academy-web cadastrado no Auth real e credencial reconhecida pelo endpoint de tokens. Pendente publicar a origem e validar login de conta real. Implementada separação de sessões de produtor/aluno, com testes de sessão assinada e autorização HTTP. Pendente papel administrativo e validação de login de conta real no Auth.
- Banco academy_db provisionado no PostgreSQL 18 do applications. Esquema de academias, domínios, membros, cursos, módulos, aulas, matrículas, progresso e referências de mídia aplicado, com RLS e chaves compostas por academia verificadas. Pendente conectar o runtime, migrar os dados SQLite e integrar armazenamento de objetos.
- Implementado catálogo de cursos, descrições, módulos ordenados e aulas vinculadas a gravações concluídas, com edição de nomes. Implementada importação de vídeos/áudios existentes como rascunhos, com revisão e envio pelo fluxo existente. Implementados anexos por aula com upload, download, remoção e verificação de matrícula/publicação para alunos.
- Implementados salvamento incremental em IndexedDB, recuperação de trechos parciais e envio opcional durante a captura com retomada, validação de finalização e criação idempotente. Persistência do piloto em SQLite. Pendente processamento assíncrono e migração para PostgreSQL/objetos.
- Implementadas pausa, retomada, prévia antes da captura, encerramento da prévia com liberação de dispositivos e indicador do nível do microfone. A seleção de uma câmera ou microfone específico ainda utiliza o padrão do navegador.
- Aceite: o Abraão consegue gravar em um computador e revisar em outro. Um produtor da academia de teste só acessa os próprios cursos e arquivos.

## 3. Publicação e área do aluno

- Implementados estado publicado/rascunho, matrícula manual por subject OIDC, revogação/reativação e autorização de mídia por matrícula e academia. Implementados anexos autorizados por matrícula e publicação. Pendente validação com contas reais.
- Implementados área do aluno em /aluno, cursos com módulos/aulas publicadas, progresso persistente por aula e retomada da posição. Pendente refino visual da vitrine e trilhas entre cursos.
- Ativar domínio verificado com HTTPS, logotipo, cores e e-mails por cliente.
- Aceite: um aluno convidado acessa seu curso no domínio do produtor, retoma a aula e perde o acesso quando a matrícula é revogada.

## 4. Treinamentos e mentorias

- Criar turmas com calendário, materiais, atividades, presença e feedback do mentor.
- Integrar sala ao vivo, sinalização de gravação aos participantes e replay privado em rascunho.
- Aceite: o mentor agenda um encontro, revisa a gravação e libera o replay para a turma escolhida.

## 5. Operação comercial

- Integrar Mercado Pago com eventos idempotentes de pagamento, reembolso e cancelamento.
- Disponibilizar painel administrativo de academias, limites de armazenamento e medição de minutos de vídeo.
- Criada cópia inicial do PostgreSQL e validada restauração em banco descartável, incluindo testes de isolamento. Pendente backup de objetos/configuração, cópia externa, rotina operacional, monitoramento e carga antes da abertura comercial.
- Aceite: ativar uma segunda marca e acompanhar matrículas, custos de mídia e disponibilidade por academia.
