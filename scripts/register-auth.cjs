// Run inside the existing Auth container, using its Prisma client and database configuration.
const {createRequire}=require('node:module');
const {randomBytes,createHash}=require('node:crypto');
const {writeFileSync,readFileSync,existsSync,unlinkSync}=require('node:fs');
const {PrismaClient}=createRequire('/app/package.json')('@prisma/client');
const db=new PrismaClient();
const destination=process.argv[2];
const appId='academy';
const clientId='academy-web';
const origin='https://academy.avilaops.com';
const hash=value=>createHash('sha256').update(value).digest('hex');
(async()=>{
  if(!destination)throw Error('Informe o caminho privado para o arquivo de configuração.');
  const existing=await db.clienteOidc.findUnique({where:{id:clientId}});
  if(existing){
    if(!existsSync(destination))throw Error('Cliente já cadastrado. Recupere a configuração existente sem rotacionar o segredo.');
    const content=readFileSync(destination,'utf8');
    const secret=content.match(/^OIDC_CLIENT_SECRET=([a-f0-9]+)$/m)?.[1];
    if(existing.appId!==appId||existing.redirectUris!==origin+'/auth/callback'||!secret||existing.segredoHash!==hash(secret))throw Error('Cadastro existente diverge da configuração.');
    console.log('Cliente existente e configuração conferidos.');return;
  }
  const secret=randomBytes(32).toString('hex');
  writeFileSync(destination,'PUBLIC_ORIGIN='+origin+'\nOIDC_CLIENT_ID='+clientId+'\nOIDC_CLIENT_SECRET='+secret+'\nACADEMY_PRODUCERS={}\n',{mode:0o600,flag:'wx'});
  try {
    await db.$transaction(async tx=>{
      const app=await tx.aplicacao.findUnique({where:{id:appId}});
      if(app && app.host!==new URL(origin).host)throw Error('Identificador da aplicação já pertence a outro domínio.');
      if(!app)await tx.aplicacao.create({data:{
        id:appId,host:new URL(origin).host,nome:'Ávila Academy',tipo:'app',login:true,restrito:true,
        repositorio:'avilaops/avila-academy',servidor:'applications',publicacao:'container',situacao:'planejado',
        observacao:'Implantação em andamento. Matrículas e produtores administrados pela Academy.'
      }});
      await tx.clienteOidc.create({data:{
        id:clientId,appId,nome:'Ávila Academy Web',redirectUris:origin+'/auth/callback',
        segredoHash:hash(secret),ativo:true,
        redirects:{create:[{uri:origin+'/auth/callback',tipo:'authorization'}]}
      }});
    });
  } catch(error) {unlinkSync(destination);throw error;}
  console.log('Aplicação planejada e cliente OIDC cadastrados. Configuração privada gravada.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
