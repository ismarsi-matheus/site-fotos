# Site de fotos da festa (prévia)

Os convidados leem o QR code, mandam fotos pelo celular, as fotos aparecem no telão na hora e ficam guardadas **na qualidade original** para a debutante.

- **Site (páginas):** Vercel.
- **Fotos:** Cloudflare. O armazenamento fica no R2, a lista de fotos no D1 e o servidor que recebe os envios num Worker.

## O que tem em cada arquivo

| Arquivo | Para que serve |
|---|---|
| `config.js` | Nome da debutante, data, textos e endereço do servidor de fotos. É o único arquivo que muda de uma festa para outra. |
| `index.html` | Página do convidado. É para onde o QR code leva. |
| `galeria.html` | Álbum da festa: todas as fotos, foto ampliada, download do original e "Baixar todas (.zip)". |
| `telao.html` | Para o projetor ou TV. Uma foto por vez, em tela cheia, com o QR code do lado. Foto nova aparece na hora com o selo "Acabou de chegar". |
| `qrcode.html` | Plaquinha pronta para imprimir e colocar nas mesas. |
| `fotos.js` | O "motor" do site: prepara, envia, lista e avisa quando chega foto nova. |
| `estilo.css` | Cores e fontes. |
| `cloudflare/` | O servidor de fotos. Não vai para a Vercel. |

## Como funciona a qualidade

Para cada foto, o celular do convidado envia três arquivos, nesta ordem:

| Versão | Tamanho | Para que serve |
|---|---|---|
| Miniatura | 480 px, ~40 KB | Galeria no celular (economiza internet) |
| Telão | 2048 px, ~600 KB a 1 MB | Projetor ou TV. Aparece no telão em 1 a 2 segundos. |
| **Original** | 3 a 8 MB | **O arquivo exatamente como saiu do celular, sem nenhuma alteração.** É o que se baixa na galeria e no .zip. |

Se a internet oscilar, o celular tenta de novo sozinho, três vezes. Se mesmo assim falhar, a foto fica marcada com "Toque para tentar de novo" e só reenvia o que faltou.

## Testar sem a Cloudflare (modo demonstração)

Com `apiUrl` vazio no `config.js`:

1. Abra o `index.html` no navegador.
2. Em outra aba, abra o `telao.html`.
3. Envie fotos na primeira aba e veja elas chegarem no telão.

As fotos ficam só naquele navegador. Serve para mostrar o visual, mas não junta fotos de celulares diferentes.

## Colocar para funcionar de verdade

Você vai precisar do Node.js instalado e de uma conta na Cloudflare com cartão cadastrado (o R2 exige, mesmo na faixa grátis).

### 1. Servidor de fotos na Cloudflare

No terminal, dentro da pasta `cloudflare`:

```
npm install
npx wrangler login
npx wrangler r2 bucket create fotos-festa
npx wrangler d1 create fotos-festa
```

O último comando mostra um `database_id`. Copie esse valor para o `wrangler.jsonc`, no lugar de `00000000-...`. Depois:

```
npx wrangler d1 execute fotos-festa --remote --file=schema.sql
npx wrangler secret put SENHA_ORGANIZACAO
npm run publicar
```

- `SENHA_ORGANIZACAO` é a senha para esconder fotos e apagar o evento. Escolha uma forte e guarde.
- O `npm run publicar` mostra o endereço do servidor, algo como `https://fotos-festa.seu-usuario.workers.dev`. Cole esse endereço em `apiUrl` no `config.js`.

### 2. Site na Vercel

1. Na raiz do projeto: `npx vercel` (na primeira vez ele pede login), ou suba a pasta pelo painel da Vercel. Não tem build: é só HTML.
2. Cole o endereço gerado em `linkDoSite` no `config.js` e publique de novo (`npx vercel --prod`).
3. Abra o `qrcode.html` publicado, confira o link embaixo do QR code e imprima.

O arquivo `.vercelignore` já impede que a pasta `cloudflare/` seja publicada na Vercel.

> **Atenção:** o plano grátis da Vercel (Hobby) é só para uso não comercial. Para uma cliente que paga pelo serviço, o correto é o plano Pro. Uma alternativa é hospedar as páginas também na Cloudflare, que permite uso comercial no plano grátis.

### 3. Teste de carga (faça antes da festa)

Dentro da pasta `cloudflare`:

```
node teste-carga.mjs https://fotos-festa.seu-usuario.workers.dev 100 3
```

Isso simula 100 convidados mandando 3 fotos cada ao mesmo tempo, com 50 celulares de galeria aberta. O resultado mostra quantas fotos chegaram e quanto tempo levaram para aparecer no telão. Depois, apague as fotos de teste:

```
node teste-carga.mjs https://fotos-festa.seu-usuario.workers.dev apagar SUA_SENHA
```

Rodar a partir da sua casa testa o servidor. No dia, o gargalo costuma ser a internet do salão: teste o 4G e o Wi-Fi lá.

## Moderação (esconder uma foto do telão)

Ainda não há tela para isso, mas o servidor já aceita. Pelo terminal:

```
curl -X POST -H "Authorization: Bearer SUA_SENHA" https://fotos-festa.seu-usuario.workers.dev/esconder/debutante-marina-15/ID_DA_FOTO
```

A foto some do telão e da galeria em poucos segundos, inclusive se estiver na tela naquele momento. O ID aparece no endereço da foto (`/arquivo/<evento>/<ID>/telao`).

## Armazenamento e custos

Uma festa de 15 anos com uns 150 convidados:

| | Estimativa |
|---|---|
| Fotos | 1.000 a 2.000 |
| Originais | 3 a 8 MB cada |
| **Espaço total** | **~6 a 12 GB** |

- **R2:** 10 GB grátis. Passou disso, cerca de US$ 0,015 por GB por mês. **Não há cobrança por tráfego**, então telão e galeria podem ser abertos à vontade.
- **Workers:** o plano grátis tem 100 mil requisições por dia. Uma festa com muitos celulares na galeria pode passar disso, e **se passar, os envios dão erro até o dia virar**. Assine o **Workers Paid (US$ 5 por mês)** uma semana antes da festa e cancele depois.
- Configure um **alerta de gasto** no painel da Cloudflare.

Confira os limites atuais no site da Cloudflare; eles mudam.

## Depois da festa

1. Abra a galeria e use **"Baixar todas (.zip)"**. Vêm os originais.
2. Entregue para a cliente (Google Drive, pen drive).
3. Combinado o prazo com a cliente (LGPD), apague tudo do servidor:

```
curl -X POST -H "Authorization: Bearer SUA_SENHA" https://fotos-festa.seu-usuario.workers.dev/apagar-evento/debutante-marina-15
```

## O que esta prévia ainda não tem (para a versão oficial)

- **Tela de moderação** para a organização esconder fotos com um toque. O servidor já está pronto para isso.
- **Proteção do envio:** qualquer pessoa com o link consegue enviar. Para festas é aceitável, mas dá para adicionar um código do evento ou limite por celular.
- **Envio que continua depois de fechar a página:** hoje o convidado precisa manter a página aberta até o original terminar (o site avisa).
- **Vídeos:** só fotos.
- **Vários eventos:** já funciona trocando o `slug` no `config.js`. Na plataforma, isso vira o painel da cerimonialista.
