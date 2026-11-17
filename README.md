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
