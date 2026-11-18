# Ávila Academy

Plataforma white label da Ávila Ops para produtores organizarem cursos, treinamentos e mentorias com sua própria marca. O primeiro ambiente de desenvolvimento é a Academia do Abraão.

## Primeiro incremento

O professor informa curso, módulo e título, seleciona uma fonte e grava no navegador. Há quatro modos de captura: câmera e microfone, tela e microfone, tela com câmera sobreposta e microfone, ou apenas microfone. Ao finalizar, pode assistir, baixar o arquivo e reabrir o rascunho após recarregar a página.

A marca é selecionada pelo domínio. Os dois ambientes de desenvolvimento têm origens distintas e cada navegador armazena os próprios rascunhos em IndexedDB. O servidor conhece apenas as marcas locais. O piloto inclui sessões OIDC de produtor/aluno, biblioteca no servidor, catálogo, matrículas e reprodução autorizada. O estado de implantação e as entregas restantes estão no [roadmap](ROADMAP.md).

## Executar

Requer Node.js 24. O aplicativo usa APIs nativas de Node e do navegador. A camada PostgreSQL utiliza o driver pg e o acesso privado ao R2 utiliza o AWS SDK S3, com versões registradas no package-lock.json.

```sh
npm ci
npm start
```

Abra http://abraao.localhost:3000 para o piloto ou http://demo.localhost:3000 para a segunda marca. O endereço http://localhost:3000 também apresenta o estúdio do Abraão e possui armazenamento próprio. O servidor escuta somente em loopback. A variável PORT permite ajustar a porta.

Em um navegador desktop com os recursos de captura disponíveis, preencha os três campos, escolha a fonte e clique em **Iniciar gravação**. Autorize o microfone e, quando solicitado, escolha a janela ou tela. Clique em **Finalizar gravação**, confira a prévia e salve uma cópia com **Baixar gravação**.

## Limites desta versão

A captura usa áudio do microfone. A seleção de tela depende do navegador. O estúdio grava as partes em IndexedDB durante a captura e monta o arquivo para revisão ao finalizar. Use aulas curtas no piloto e baixe uma cópia. Fechar a aba perde o intervalo que ainda não foi entregue pelo gravador ou confirmado no armazenamento local. As partes já confirmadas podem ser recuperadas como trecho parcial. Limpar os dados do navegador remove os rascunhos. Esta versão se destina a desenvolvimento local.

## Estrutura e verificação

- `server.ts` resolve a marca e serve os arquivos da interface.
- `public/studio.js` controla permissões, captura, revisão e download.
- `public/composition.js` combina slides e câmera em um vídeo.
- `public/storage.js` grava mídia e metadados na mesma transação.
- `npm test` verifica marcas por domínio e rejeição de domínio desconhecido.
- O fluxo de CI executa também `test/browser.cjs` no Chromium com dispositivos simulados para verificar gravação, persistência e separação dos rascunhos por origem.

## Biblioteca persistente e login OIDC

O estúdio agora permite enviar o rascunho ao servidor após a revisão. A transferência de arquivos importados e rascunhos antigos ocorre em partes de 4 MiB e pode ser retomada clicando novamente em salvar. O identificador remoto permanece no rascunho local. Partes repetidas são aceitas apenas se os bytes coincidirem. A biblioteca lista as aulas da academia por curso e módulo e permite abrir gravações concluídas.

Nesta fase os metadados e as partes de vídeo usam SQLite nativo do Node, no diretório `data`. Trata-se de uma decisão para permitir execução e testes sem provisionar infraestrutura. PostgreSQL e armazenamento de objetos continuam previstos para operação comercial. Os dados não são versionados. Defina DATA_DIRECTORY para um volume persistente e faça backup consistente do SQLite, incluindo o WAL ou usando a API de backup.

A biblioteca exige sessão de produtor. O login usa o Auth da Ávila Ops com código de autorização, PKCE S256, state, nonce e validação RS256 do ID token. Configure no ambiente do processo, sem versionar segredos:

- OIDC_CLIENT_ID e OIDC_CLIENT_SECRET do cliente cadastrado no Auth.
- PUBLIC_ORIGIN com a origem exata do piloto, sem barra final.
- ACADEMY_PRODUCERS com JSON que associa academia aos subjects OIDC autorizados, por exemplo `{"abraao":["subject-do-produtor"]}`.
- Registrar no Auth a URI PUBLIC_ORIGIN seguida de `/auth/callback`.

O servidor local reconhece abraao.localhost e demo.localhost. Para um domínio real é necessário cadastrar a associação validada de domínio no servidor e configurar HTTPS. A configuração atual habilita login em uma origem por instância. As sessões têm duração de oito horas, ficam em memória e são invalidadas ao reiniciar. O botão Sair encerra a sessão da Academy. Sem credenciais OIDC configuradas, o estúdio local funciona e a biblioteca permanece protegida.

A integração usa os endpoints publicados pelo discovery do Auth. O cliente real já está cadastrado. A conclusão do login com uma conta real depende de publicar a origem e configurar os acessos e produtores. Essa etapa ainda não foi validada de ponta a ponta.

## Próximas entregas

As próximas entregas incluem processamento assíncrono, PostgreSQL e objetos, publicação da origem com login real, personalização de domínios, mentorias, vídeo ao vivo e pagamentos, conforme o roadmap.

## Catálogo do produtor

A seção Meus cursos cria cursos com descrição, módulos ordenados e aulas vinculadas às gravações concluídas. O produtor pode renomear cursos, módulos e aulas e mover módulos para cima. A API exige a mesma sessão de produtor da biblioteca e verifica a academia em cada acesso e vínculo.

Uma aula pode ser marcada como publicada ou voltar a rascunho. Esse estado controla a visibilidade da aula para alunos com matrícula ativa. A ordenação dos módulos exige a lista completa sem duplicações e é aplicada em uma única transação.

O estúdio permite pausar, continuar e finalizar uma captura pausada. Os testes do navegador exercitam pausa e retomada nos quatro modos de gravação.

## Preparar e importar aulas

Use **Testar câmera e microfone** para abrir a prévia antes de gravar. O indicador mostra o nível do microfone, sem reproduzir sua voz nos alto-falantes. A fonte de captura fica fixa durante a prévia. Para mudar de fonte, use **Encerrar prévia**, que libera câmera, microfone e compartilhamento de tela. Preencha os dados da aula e clique em **Iniciar gravação** quando estiver pronto. O botão de início direto continua disponível e solicita as permissões quando necessário.

Também é possível selecionar uma aula já gravada em **Importar aula gravada**. São aceitos arquivos com MIME MP4, WebM ou Ogg, de áudio ou vídeo, não vazios e de até 1 GiB. Curso e módulo são obrigatórios. Se o título estiver vazio, ele é sugerido pelo nome do arquivo. O arquivo passa a ser um rascunho local revisável, com o mesmo envio retomável ao servidor. Compatibilidade de reprodução depende dos codecs suportados pelo navegador. O limite de armazenamento local também depende do espaço e da quota do navegador.

Os testes do Chrome verificam liberação dos dispositivos ao encerrar a prévia, prévia sem início de gravação, gravação e pausa nos quatro modos, importação com persistência após recarregar e rejeição de formato incompatível. O cliente OIDC real já está cadastrado. O envio com conta real continua pendente de implantação e validação.

## Alunos, matrículas e progresso

A rota `/aluno` apresenta os cursos liberados para a conta autenticada. O aluno pode selecionar uma aula, retomar o ponto salvo e marcar conclusão. O player salva a posição durante a reprodução, ao pausar e ao encerrar. A reprodução suporta HTTP Range, inclusive pedidos que cruzam as partes do upload. O progresso fica persistido por matrícula e aula.

No catálogo do produtor, a seção Alunos libera cursos pelo identificador estável da conta no Auth (`sub` OIDC), revoga e reativa matrículas. A busca de alunos por nome/e-mail ainda depende da integração de diretório. Reativar a mesma matrícula preserva seu progresso.

O login agora cria uma sessão de aluno para contas OIDC válidas que não constam na configuração de produtores. Essa sessão só acessa conteúdo com matrícula ativa. As APIs de catálogo, gravações e matrículas continuam exclusivas dos produtores. A área do aluno só recebe aulas publicadas com mídia concluída, dentro da própria academia. Cada nova requisição de vídeo e progresso verifica novamente a matrícula. Bytes já recebidos pelo navegador não podem ser revogados.

Os testes de sessão usam tokens RS256 assinados por uma chave gerada no próprio teste e respostas locais para os endpoints do provedor. Eles verificam separação de papéis, CSRF e encerramento de sessão pelo servidor HTTP real. Isso não substitui a validação com o Auth em produção, ainda pendente de implantação e acesso com uma conta real.

Os testes de aprendizagem verificam matrícula, isolamento entre academias e alunos, publicação, ocultação de rascunhos, revogação, reativação, persistência do progresso após reinício e leitura de trechos do vídeo. A persistência desta etapa continua em SQLite.

## Materiais complementares

Cada aula aceita PDF, PNG, JPEG, TXT e ZIP de até 25 MiB por arquivo. O produtor pode enviar, baixar e remover materiais no catálogo. Cada envio usa um identificador para que repetir a mesma requisição não duplique o arquivo. Reutilizar o identificador com conteúdo diferente é recusado.

O aluno vê os materiais junto ao player. Cada download verifica academia, matrícula ativa e publicação da aula. Os arquivos são entregues como anexos para download, com proteção contra interpretação do conteúdo pelo navegador. Os testes cobrem repetição de upload, conflito, isolamento, persistência após reinício e revogação do download. Nesta etapa os arquivos ficam no SQLite do piloto.

## Cadastro real no Auth

Em 17/11/2026 foi cadastrada a aplicação planejada `academy`, com cliente confidencial `academy-web` e retorno exato `https://academy.avilaops.com/auth/callback`. Esse endereço foi escolhido para preparar a implantação. O domínio ainda não foi publicado pela Academy. A aplicação permanece restrita no Auth, e os produtores ainda precisam ser associados a contas reais.

O endpoint real de tokens reconheceu a credencial. Uma requisição de verificação com código deliberadamente inválido retornou `invalid_grant`, em vez de `invalid_client`. Essa verificação não é um login concluído.

A configuração privada está no servidor applications em `/opt/avila-academy/config/oidc.env`, com permissão 600. Ela não está no GitHub. Não imprima nem copie seu conteúdo para logs. O script `scripts/register-auth.cjs` documenta o cadastro e confere o cliente existente sem rotacionar o segredo. Ele depende do Prisma e da configuração de banco do container do Auth e recebe como argumento o caminho do arquivo privado. Para conferir um cadastro existente, o arquivo correspondente precisa estar disponível nesse caminho. Após o cadastro, as cópias temporárias foram removidas do container do Auth.

## Salvamento e envio durante a captura

O gravador salva as partes em transações IndexedDB com durabilidade estrita aproximadamente a cada segundo, conforme a entrega de dados pelo navegador. Use **Enviar ao servidor durante a gravação** para ativar a sincronização. É preciso estar autenticado como produtor. O gravador continua salvando localmente se o envio falhar.

As capturas novas usam segmentos de rede de 256 KiB. Só segmentos completos são enviados enquanto a captura está aberta. Ao finalizar, o restante é enviado e o cliente confirma tamanho total e quantidade de segmentos. O servidor rejeita a finalização com contadores divergentes. A criação também usa um identificador estável, evitando duplicar uma gravação quando a resposta de criação se perde.

Quando a conexão retorna, o gravador ativo tenta sincronizar novamente. Após encerrar a captura, **Salvar aula no servidor** permite retomar manualmente. O envio é serializado por rascunho, consulta as partes já confirmadas e preserva os limites de segmento durante toda a retomada.

Uma captura interrompida aparece como trecho parcial. **Finalizar trecho recuperado** permite revisar, baixar e enviar as partes que chegaram a ser salvas. Um trecho interrompido pode precisar de processamento para reprodução completa em todos os navegadores. Se a quota local se esgotar, o gravador para e oferece download dos dados disponíveis na sessão. Mantenha uma cópia antes de fechar a página.

O teste do Chrome provoca uma falha abrupta do renderer durante uma captura já parcialmente salva e verifica recuperação na mesma origem. Outro cenário usa transporte simulado para verificar envio antes do encerramento, perda de uma resposta, retomada e igualdade dos bytes enviados com o arquivo local. O backend real é testado separadamente para idempotência, ordem e finalização. A validação do envio com conta real continua pendente de implantação.

## PostgreSQL no applications

O banco `academy_db` foi provisionado no PostgreSQL 18 do applications. O esquema `academy` contém academias, domínios, membros, cursos, módulos, aulas, matrículas e progresso. Mídias e anexos têm referências a chaves privadas de objetos e hashes. O novo serviço de gravações integra objetos privados R2, com validação direta no banco real. Os anexos e o adapter HTTP ainda precisam dessa migração.

A migração `migrations/postgres/001-academy.sql` é transacional e repetível. As tabelas usam Row Level Security com academia obrigatória, além de chaves estrangeiras compostas que impedem vínculos entre academias. O usuário `academy_app` não é proprietário do esquema e não tem privilégios de superusuário, criação de bancos/roles ou bypass de RLS.

O futuro adapter deverá abrir uma transação por operação, definir a academia com `SELECT set_config('academy.tenant', $1, true)` e usar a mesma conexão até commit/rollback. O valor deve vir da resolução de domínio validada pelo servidor. Consultas sem esse contexto não veem dados. A RLS protege o limite da academia. Matrícula, publicação e permissões de cada pessoa continuam sendo verificadas pelo aplicativo.

**O runtime ainda utiliza SQLite.** Este passo prepara e verifica o destino da migração. Ele não conecta automaticamente o servidor Node ao PostgreSQL nem copia as gravações existentes. O domínio planejado está cadastrado no banco com verificação pendente.

A configuração privada está em `/opt/avila-academy/config/postgres.env`, com permissão 600 e sem cópia no GitHub. O script `scripts/provision-postgres.py` roda no applications com privilégios administrativos, recebe os caminhos da migração e de `test/postgres/isolation.sql`, reutiliza a credencial existente sem rotação e verifica a conexão do usuário da aplicação.

Os testes SQL verificam leitura/alteração/exclusão/inserção entre academias, rejeição de módulo vinculado ao curso de outra academia, bloqueio de DDL e ausência de dados sem contexto. Eles rodam em transação com rollback e também foram executados no banco real. O GitHub Actions possui um job PostgreSQL 18 independente para reaplicar a migração e repetir essas verificações.

## Cópia inicial e restauração do PostgreSQL

O script `scripts/verify-postgres-backup.py` cria um dump privado em `/opt/avila-academy/backups`, restaura em um banco descartável, executa os testes de isolamento e remove esse banco ao terminar. A cópia inicial do banco real passou nessa verificação. Dumps ficam fora do repositório.

Essa validação cobre o novo banco PostgreSQL. Ainda faltam a migração dos dados usados pelo runtime, backup dos objetos e da configuração, cópia externa e rotina de recuperação do serviço completo.

## Camada de acesso PostgreSQL

`persistence/postgres.ts` implementa o pool e as transações com contexto de academia, parâmetros SQL e search_path fixo. O usuário da conexão é verificado para recusar superusuário, bypass de RLS ou proprietário do esquema. Contexto, limites de consulta e locks valem apenas durante a transação. O callback recebe uma conexão que deixa de aceitar consultas após o encerramento.

Falhas provocam rollback antes de devolver a conexão ao pool. Uma operação que captura um erro SQL e tenta confirmar a transação abortada também é recusada. Não há repetição automática de callbacks, pois eles podem conter efeitos externos.

`persistence/courses.ts` implementa criação e leitura de cursos, inclusão concorrente de módulos e reordenação atômica. As operações de ordenação bloqueiam o curso pai para evitar posições duplicadas. A leitura usa um snapshot repetível para manter os módulos e aulas consistentes.

`npm run test:postgres` requer DATABASE_URL de um usuário restrito e esquema já migrado. O teste usa identificadores temporários, verifica concorrência, isolamento, rollback e conexão fora de escopo e remove seus próprios dados ao terminar. Ele passou no PostgreSQL real do applications com a credencial da Academy. O mesmo teste roda no PostgreSQL 18 do CI.

**As rotas HTTP ainda usam o catálogo SQLite.** A camada PostgreSQL está funcional e testada diretamente. A troca das rotas depende de concluir os serviços de mídia, anexos, matrículas e progresso no novo armazenamento. Definir DATABASE_URL, por si só, ainda não altera a persistência do servidor.

## Aprendizagem no repositório PostgreSQL

A camada PostgreSQL inclui criação concorrente de aulas, publicação/rascunho, matrícula idempotente, revogação/reativação e progresso por aluno. A criação de aula exige mídia com estado ready na mesma academia. As leituras do aluno filtram matrícula ativa, publicação e mídia concluída.

O salvamento de progresso mantém locks compartilhados de matrícula, aula e mídia até confirmar a gravação. A revogação e a publicação usam os locks de atualização do PostgreSQL. Assim, uma revogação confirmada bloqueia novas operações, e a reativação mantém os dados anteriores. Uma conclusão já registrada não é apagada por um salvamento posterior de posição.

Os testes rodaram no banco real com linhas temporárias de metadados. Verificaram isolamento entre academias e alunos, visibilidade de rascunhos, revogação, reativação, validação de progresso e ordem concorrente de aulas. Esses testes não representam upload ou reprodução de um objeto real.

Os serviços continuam aguardando a integração completa do adapter HTTP. O servidor em execução local permanece no backend SQLite.

## Objetos privados e upload PostgreSQL

`persistence/recordings.ts` implementa criação idempotente, partes sequenciais, retomada, finalização com contadores obrigatórios e manifesto de reprodução. Cada gravação aceita até 1 GiB, em partes de até 8 MiB. Um lock na gravação serializa upload e finalização. Partes repetidas só são aceitas com mesmo tamanho e SHA-256. A RLS impede leitura e alteração de outra academia, inclusive reutilização de identificadores de upload.

As partes são objetos independentes, identificados por academia, gravação, sequência e hash. Isso mantém os segmentos de 256 KiB usados durante a captura sem depender do tamanho mínimo das partes do multipart S3. O banco recebe apenas referências e contadores, após a confirmação do objeto. Uma perda de resposta pode deixar um objeto sem referência, que a retomada reutiliza sem sobrescrever. A coleta operacional de objetos órfãos ainda está pendente; o serviço não apaga objetos em rollback para evitar remover conteúdo já referenciado por outra tentativa.

`persistence/objects.ts` oferece R2 privado e um adapter de arquivos privados para desenvolvimento/testes. O R2 usa PUT condicional e não sobrescreve objetos existentes. A leitura de mídia verifica tamanho e SHA-256 antes de entregar os bytes e busca apenas as partes que cruzam o intervalo solicitado. O adapter de arquivos usa criação atômica e arquivos com permissão 600. Seu diretório não deve ser servido estaticamente.

Foi criado o bucket dedicado `avilaops-academy-media`, com r2.dev desativado e nenhum domínio público. A credencial tem permissão de objetos restrita a esse bucket. A configuração fica em `/opt/avila-academy/config/objects.env`, com permissão 600, usando R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY. Ela nunca deve ser enviada ao navegador, versionada ou impressa. A configuração e a derivação das credenciais seguem a [documentação oficial do R2](https://developers.cloudflare.com/r2/api/tokens/).

Os testes de integração passaram no PostgreSQL do applications e no R2 real: falha antes da gravação, perda de resposta após persistir o objeto, retomada concorrente, conflito de bytes, ordem das partes, finalização divergente, isolamento, leitura parcial e verificação de integridade. Os objetos e registros temporários são removidos ao terminar. O conteúdo usado no teste comprova transporte de bytes; não substitui um teste de reprodução de vídeo no navegador ou processamento de codecs.

O CI executa os mesmos cenários de repositório com PostgreSQL 18 e o adapter de arquivos, sem credenciais de produção. Para a verificação real autorizada no applications, execute `ACADEMY_TEST_R2=1 node --env-file=/opt/avila-academy/config/postgres.env --env-file=/opt/avila-academy/config/objects.env --test test/postgres/recordings.test.ts`. Esse comando cria e remove apenas seus próprios dados temporários.

**As rotas HTTP continuam no SQLite.** Esta entrega conclui o serviço de gravações PostgreSQL/R2, mas não troca o backend do piloto. Ainda faltam anexos no novo armazenamento, adapter HTTP, migração dos dados e processamento assíncrono antes de validar captura e reprodução completas com usuários reais.
