# Ávila Academy

Plataforma white label da Ávila Ops para produtores organizarem cursos, treinamentos e mentorias com sua própria marca. O primeiro ambiente de desenvolvimento é a Academia do Abraão.

## Primeiro incremento

O professor informa curso, módulo e título, seleciona uma fonte e grava no navegador. Há quatro modos de captura: câmera e microfone, tela e microfone, tela com câmera sobreposta e microfone, ou apenas microfone. Ao finalizar, pode assistir, baixar o arquivo e reabrir o rascunho após recarregar a página.

A marca é selecionada pelo domínio. Os dois ambientes de desenvolvimento têm origens distintas e cada navegador armazena os próprios rascunhos em IndexedDB. O servidor conhece apenas as marcas locais. O piloto inclui sessões OIDC de produtor/aluno, biblioteca no servidor, catálogo, matrículas e reprodução autorizada. O estado de implantação e as entregas restantes estão no [roadmap](ROADMAP.md).

## Executar

Requer Node.js 24. O aplicativo usa APIs nativas de Node e do navegador e dispensa instalação de dependências em execução.

```sh
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

O gravador salva as partes em IndexedDB aproximadamente a cada segundo, conforme a entrega de dados pelo navegador. Use **Enviar ao servidor durante a gravação** para ativar a sincronização. É preciso estar autenticado como produtor. O gravador continua salvando localmente se o envio falhar.

As capturas novas usam segmentos de rede de 256 KiB. Só segmentos completos são enviados enquanto a captura está aberta. Ao finalizar, o restante é enviado e o cliente confirma tamanho total e quantidade de segmentos. O servidor rejeita a finalização com contadores divergentes. A criação também usa um identificador estável, evitando duplicar uma gravação quando a resposta de criação se perde.

Quando a conexão retorna, o gravador ativo tenta sincronizar novamente. Após encerrar a captura, **Salvar aula no servidor** permite retomar manualmente. O envio é serializado por rascunho, consulta as partes já confirmadas e preserva os limites de segmento durante toda a retomada.

Uma captura interrompida aparece como trecho parcial. **Finalizar trecho recuperado** permite revisar, baixar e enviar as partes que chegaram a ser salvas. Um trecho interrompido pode precisar de processamento para reprodução completa em todos os navegadores. Se a quota local se esgotar, o gravador para e oferece download dos dados disponíveis na sessão. Mantenha uma cópia antes de fechar a página.

O teste do Chrome provoca uma falha abrupta do renderer durante uma captura já parcialmente salva e verifica recuperação na mesma origem. Outro cenário usa transporte simulado para verificar envio antes do encerramento, perda de uma resposta, retomada e igualdade dos bytes enviados com o arquivo local. O backend real é testado separadamente para idempotência, ordem e finalização. A validação do envio com conta real continua pendente de implantação.
