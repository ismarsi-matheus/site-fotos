/*
  TESTE DE CARGA
  Simula muitos convidados enviando fotos ao mesmo tempo e celulares com a galeria aberta.
  Rode ANTES da festa, contra o servidor publicado:

    node teste-carga.mjs https://fotos-festa.seu-usuario.workers.dev 100 3

  (endereço, número de convidados, fotos por convidado)
  As fotos de teste vão para o evento "teste-carga". Para apagar depois:

    node teste-carga.mjs https://fotos-festa.seu-usuario.workers.dev apagar SUA_SENHA
*/
const [api = 'http://127.0.0.1:8787', convidadosArg = '50', fotosArg = '2'] = process.argv.slice(2);
const EVENTO = 'teste-carga';

if (convidadosArg === 'apagar') {
  const resp = await fetch(`${api}/apagar-evento/${EVENTO}`, { method: 'POST', headers: { Authorization: `Bearer ${fotosArg}` } });
  console.log(resp.status, await resp.text());
  process.exit(0);
}

const CONVIDADOS = Number(convidadosArg), FOTOS = Number(fotosArg);
const TAMANHOS = { miniatura: 40e3, telao: 600e3, original: 4e6 }; // parecidos com uma foto real de celular

function arquivoFalso(bytes) {
  const dados = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i += 4096) dados[i] = Math.random() * 255;
  return new Blob([dados], { type: 'image/jpeg' });
}
const ARQUIVOS = Object.fromEntries(Object.entries(TAMANHOS).map(([v, b]) => [v, arquivoFalso(b)]));

const tempos = { telao: [], completa: [] };
let ok = 0, falhas = 0, listagens = 0, falhasListagem = 0;
const erros = new Map();

async function enviarFoto(convidado) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const inicio = performance.now();
  try {
    for (const versao of ['miniatura', 'telao', 'original']) {
      const busca = versao === 'telao' ? `?autor=Convidado%20${convidado}` : '';
      const resp = await fetch(`${api}/envio/${EVENTO}/${id}/${versao}${busca}`, {
        method: 'PUT', body: ARQUIVOS[versao], headers: { 'Content-Type': 'image/jpeg' }
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      if (versao === 'telao') tempos.telao.push(performance.now() - inicio);
    }
    tempos.completa.push(performance.now() - inicio);
    ok++;
  } catch (erro) {
    falhas++;
    erros.set(erro.message, (erros.get(erro.message) || 0) + 1);
  }
}

// Celulares com a galeria aberta, buscando novidades como o site faz
let rodando = true;
async function espectador() {
  let desde = 0;
  while (rodando) {
    try {
      const resp = await fetch(`${api}/fotos/${EVENTO}?desde=${desde}`);
      if (!resp.ok) throw new Error();
      for (const f of (await resp.json()).fotos) desde = Math.max(desde, f.atualizada_em);
      listagens++;
    } catch (_) { falhasListagem++; }
    await new Promise(r => setTimeout(r, 3000));
  }
}

const percentil = (lista, p) => {
  if (!lista.length) return 0;
  const ordenada = [...lista].sort((a, b) => a - b);
  return ordenada[Math.min(ordenada.length - 1, Math.floor(ordenada.length * p))];
};
const seg = ms => (ms / 1000).toFixed(1) + ' s';

console.log(`Simulando ${CONVIDADOS} convidados × ${FOTOS} fotos contra ${api} ...`);
const inicio = performance.now();
const espectadores = Array.from({ length: Math.min(CONVIDADOS, 50) }, espectador);
await Promise.all(Array.from({ length: CONVIDADOS }, async (_, c) => {
  for (let f = 0; f < FOTOS; f++) await enviarFoto(c + 1);
}));
rodando = false;
await Promise.all(espectadores);

const total = ok + falhas;
console.log(`
Fotos enviadas:        ${ok} de ${total} (${((ok / total) * 100).toFixed(1)}%)
Até aparecer no telão: metade em ${seg(percentil(tempos.telao, .5))}, 95% em até ${seg(percentil(tempos.telao, .95))}
Envio completo:        metade em ${seg(percentil(tempos.completa, .5))}, 95% em até ${seg(percentil(tempos.completa, .95))}
Buscas da galeria:     ${listagens} ok, ${falhasListagem} com falha
Tempo total:           ${seg(performance.now() - inicio)}`);
if (erros.size) console.log('Erros:', Object.fromEntries(erros));
console.log('\nLembre de apagar as fotos de teste: node teste-carga.mjs', api, 'apagar SUA_SENHA');
