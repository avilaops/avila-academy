# Roadmap do Ávila Academy

## 1. Estúdio local — implementado

- Seleção da marca por domínio local, com Abraão e uma segunda academia de demonstração.
- Captura de câmera, tela, composição de tela com câmera ou áudio.
- Rascunho associado a curso, módulo e título, reprodução e download.

## 2. Piloto com persistência e contas

- Integrar o login da Ávila Ops via OIDC. Associar papéis de produtor, aluno e administrador a cada academia.
- Modelar academias, domínios, membros, cursos, módulos, aulas e mídias no PostgreSQL e aplicar autorização no servidor.
- Criar o catálogo do produtor com ordenação de módulos, upload de vídeos existentes e anexos.
- Enviar a gravação em partes, retomar transferências interrompidas e processar vídeo de forma assíncrona.
- Incluir prévia dos dispositivos antes da captura, teste de som e pausa.
- Aceite: o Abraão consegue gravar em um computador e revisar em outro. Um produtor da academia de teste só acessa os próprios cursos e arquivos.

## 3. Publicação e área do aluno

- Permitir revisão, publicação e matrícula manual. Proteger reprodução e anexos conforme a matrícula.
- Implementar vitrine, trilhas, progresso e continuidade da última aula.
- Ativar domínio verificado com HTTPS, logotipo, cores e e-mails por cliente.
- Aceite: um aluno convidado acessa seu curso no domínio do produtor, retoma a aula e perde o acesso quando a matrícula é revogada.

## 4. Treinamentos e mentorias

- Criar turmas com calendário, materiais, atividades, presença e feedback do mentor.
- Integrar sala ao vivo, sinalização de gravação aos participantes e replay privado em rascunho.
- Aceite: o mentor agenda um encontro, revisa a gravação e libera o replay para a turma escolhida.

## 5. Operação comercial

- Integrar Mercado Pago com eventos idempotentes de pagamento, reembolso e cancelamento.
- Disponibilizar painel administrativo de academias, limites de armazenamento e medição de minutos de vídeo.
- Validar backup e restauração, monitorar falhas e testar carga antes da abertura comercial.
- Aceite: ativar uma segunda marca e acompanhar matrículas, custos de mídia e disponibilidade por academia.
