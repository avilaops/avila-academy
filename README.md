# Ávila Academy

Plataforma white label da Ávila Ops para produtores organizarem cursos, treinamentos e mentorias com sua própria marca. O primeiro ambiente de desenvolvimento é a Academia do Abraão.

## Primeiro incremento

O professor informa curso, módulo e título, seleciona uma fonte e grava no navegador. Há quatro modos de captura: câmera e microfone, tela e microfone, tela com câmera sobreposta e microfone, ou apenas microfone. Ao finalizar, pode assistir, baixar o arquivo e reabrir o rascunho após recarregar a página.

A marca é selecionada pelo domínio. Os dois ambientes de desenvolvimento têm origens distintas e cada navegador armazena os próprios rascunhos em IndexedDB. O servidor conhece apenas as marcas locais. Autenticação, autorização, persistência compartilhada e publicação para alunos estão no [roadmap](ROADMAP.md).

## Executar

Requer Node.js 24. O aplicativo usa APIs nativas de Node e do navegador e dispensa instalação de dependências em execução.

```sh
npm start
```

Abra http://abraao.localhost:3000 para o piloto ou http://demo.localhost:3000 para a segunda marca. O endereço http://localhost:3000 também apresenta o estúdio do Abraão e possui armazenamento próprio. O servidor escuta somente em loopback. A variável PORT permite ajustar a porta.

Em um navegador desktop com os recursos de captura disponíveis, preencha os três campos, escolha a fonte e clique em **Iniciar gravação**. Autorize o microfone e, quando solicitado, escolha a janela ou tela. Clique em **Finalizar gravação**, confira a prévia e salve uma cópia com **Baixar gravação**.

## Limites desta versão

A captura usa áudio do microfone. A seleção de tela depende do navegador. O estúdio acumula os dados em memória durante a captura e grava o rascunho ao finalizar. Use aulas curtas no piloto e baixe uma cópia. Fechar a aba antes da finalização perde a captura em andamento. Limpar os dados do navegador remove os rascunhos. Esta versão se destina a desenvolvimento local.

## Estrutura e verificação

- `server.ts` resolve a marca e serve os arquivos da interface.
- `public/studio.js` controla permissões, captura, revisão e download.
- `public/composition.js` combina slides e câmera em um vídeo.
- `public/storage.js` grava mídia e metadados na mesma transação.
- `npm test` verifica marcas por domínio e rejeição de domínio desconhecido.
- O fluxo de CI executa também `test/browser.cjs` no Chromium com dispositivos simulados para verificar gravação, persistência e separação dos rascunhos por origem.

## Biblioteca persistente e login OIDC

O estúdio agora permite enviar o rascunho ao servidor após a revisão. A transferência ocorre em partes de 4 MiB e pode ser retomada clicando novamente em salvar. O identificador remoto permanece no rascunho local. Partes repetidas são aceitas apenas se os bytes coincidirem. A biblioteca lista as aulas da academia por curso e módulo e permite abrir gravações concluídas.

Nesta fase os metadados e as partes de vídeo usam SQLite nativo do Node, no diretório `data`. Trata-se de uma decisão para permitir execução e testes sem provisionar infraestrutura. PostgreSQL e armazenamento de objetos continuam previstos para operação comercial. Os dados não são versionados. Defina DATA_DIRECTORY para um volume persistente e faça backup consistente do SQLite, incluindo o WAL ou usando a API de backup.

A biblioteca exige sessão de produtor. O login usa o Auth da Ávila Ops com código de autorização, PKCE S256, state, nonce e validação RS256 do ID token. Configure no ambiente do processo, sem versionar segredos:

- OIDC_CLIENT_ID e OIDC_CLIENT_SECRET do cliente cadastrado no Auth.
- PUBLIC_ORIGIN com a origem exata do piloto, sem barra final.
- ACADEMY_PRODUCERS com JSON que associa academia aos subjects OIDC autorizados, por exemplo `{"abraao":["subject-do-produtor"]}`.
- Registrar no Auth a URI PUBLIC_ORIGIN seguida de `/auth/callback`.

O servidor local reconhece abraao.localhost e demo.localhost. Para um domínio real é necessário cadastrar a associação validada de domínio no servidor e configurar HTTPS. A configuração atual habilita login em uma origem por instância. As sessões têm duração de oito horas, ficam em memória e são invalidadas ao reiniciar. O botão Sair encerra a sessão da Academy. Sem credenciais OIDC configuradas, o estúdio local funciona e a biblioteca permanece protegida.

A integração usa os endpoints publicados pelo discovery do Auth. A conclusão do login com uma conta real depende do cadastro do cliente e dos subjects. Essa etapa ainda não foi validada de ponta a ponta.

## Próximas entregas

A biblioteca desta versão organiza gravações pelos campos informados. Edição de catálogo, publicação, área do aluno, matrícula, pagamento, mentorias, vídeo ao vivo e domínio real ainda estão em desenvolvimento, conforme o roadmap.

## Catálogo do produtor

A seção Meus cursos cria cursos com descrição, módulos ordenados e aulas vinculadas às gravações concluídas. O produtor pode renomear cursos, módulos e aulas e mover módulos para cima. A API exige a mesma sessão de produtor da biblioteca e verifica a academia em cada acesso e vínculo.

Uma aula pode ser marcada como publicada ou voltar a rascunho. Esse estado fica persistido para a futura área do aluno. Nesta entrega ainda não há matrícula ou reprodução por aluno. A ordenação dos módulos exige a lista completa sem duplicações e é aplicada em uma única transação.

O estúdio permite pausar, continuar e finalizar uma captura pausada. Os testes do navegador exercitam pausa e retomada nos quatro modos de gravação.

## Preparar e importar aulas

Use **Testar câmera e microfone** para abrir a prévia antes de gravar. O indicador mostra o nível do microfone, sem reproduzir sua voz nos alto-falantes. A fonte de captura fica fixa durante a prévia. Para mudar de fonte, use **Encerrar prévia**, que libera câmera, microfone e compartilhamento de tela. Preencha os dados da aula e clique em **Iniciar gravação** quando estiver pronto. O botão de início direto continua disponível e solicita as permissões quando necessário.

Também é possível selecionar uma aula já gravada em **Importar aula gravada**. São aceitos arquivos com MIME MP4, WebM ou Ogg, de áudio ou vídeo, não vazios e de até 1 GiB. Curso e módulo são obrigatórios. Se o título estiver vazio, ele é sugerido pelo nome do arquivo. O arquivo passa a ser um rascunho local revisável, com o mesmo envio retomável ao servidor. Compatibilidade de reprodução depende dos codecs suportados pelo navegador. O limite de armazenamento local também depende do espaço e da quota do navegador.

Os testes do Chrome verificam liberação dos dispositivos ao encerrar a prévia, prévia sem início de gravação, gravação e pausa nos quatro modos, importação com persistência após recarregar e rejeição de formato incompatível. O cadastro OIDC e o envio com conta real continuam pendentes de configuração e validação.

## Alunos, matrículas e progresso

A rota `/aluno` apresenta os cursos liberados para a conta autenticada. O aluno pode selecionar uma aula, retomar o ponto salvo e marcar conclusão. O player salva a posição durante a reprodução, ao pausar e ao encerrar. A reprodução suporta HTTP Range, inclusive pedidos que cruzam as partes do upload. O progresso fica persistido por matrícula e aula.

No catálogo do produtor, a seção Alunos libera cursos pelo identificador estável da conta no Auth (`sub` OIDC), revoga e reativa matrículas. A busca de alunos por nome/e-mail ainda depende da integração de diretório. Reativar a mesma matrícula preserva seu progresso.

O login agora cria uma sessão de aluno para contas OIDC válidas que não constam na configuração de produtores. Essa sessão só acessa conteúdo com matrícula ativa. As APIs de catálogo, gravações e matrículas continuam exclusivas dos produtores. A área do aluno só recebe aulas publicadas com mídia concluída, dentro da própria academia. Cada nova requisição de vídeo e progresso verifica novamente a matrícula. Bytes já recebidos pelo navegador não podem ser revogados.

Os testes de sessão usam tokens RS256 assinados por uma chave gerada no próprio teste e respostas locais para os endpoints do provedor. Eles verificam separação de papéis, CSRF e encerramento de sessão pelo servidor HTTP real. Isso não substitui a validação com o Auth em produção, ainda pendente de cadastro do cliente.

Os testes de aprendizagem verificam matrícula, isolamento entre academias e alunos, publicação, ocultação de rascunhos, revogação, reativação, persistência do progresso após reinício e leitura de trechos do vídeo. A persistência desta etapa continua em SQLite.
