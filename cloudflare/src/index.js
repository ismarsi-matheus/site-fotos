/*
  SERVIDOR DAS FOTOS (Cloudflare Worker)
  O site fica na Vercel; tudo que envolve fotos passa por aqui.

  PUT  /envio/:evento/:id/:versao   recebe uma versão da foto (miniatura, telao ou original)
  GET  /fotos/:evento?desde=:ts     lista as fotos novas ou alteradas desde :ts
  GET  /arquivo/:evento/:id/:versao entrega o arquivo da foto
  POST /esconder/:evento/:id        tira uma foto do telão e da galeria (precisa da senha da organização)
  POST /apagar-evento/:evento       apaga TODAS as fotos do evento (precisa da senha; use depois de entregar o álbum)
*/

const VERSOES = {
  miniatura: 2 * 1024 * 1024,
  telao: 10 * 1024 * 1024,
  original: 50 * 1024 * 1024
};
const POR_PAGINA = 1000;
const EVENTO = /^[a-z0-9-]{1,60}$/;
const ID = /^[a-z0-9]{6,32}$/;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    try {
      return await rotear(req, env);
    } catch (erro) {
      console.error(erro);
      return json({ erro: 'Erro no servidor. Tente de novo.' }, 500);
    }
  }
};

function rotear(req, env) {
  const url = new URL(req.url);
  const p = url.pathname.split('/').filter(Boolean);
  if (req.method === 'PUT' && p[0] === 'envio' && p.length === 4) return receber(req, env, p[1], p[2], p[3], url);
  if (req.method === 'GET' && p[0] === 'fotos' && p.length === 2) return listar(env, p[1], url);
  if (req.method === 'GET' && p[0] === 'arquivo' && p.length === 4) return servir(env, p[1], p[2], p[3]);
  if (req.method === 'POST' && p[0] === 'esconder' && p.length === 3) return esconder(req, env, p[1], p[2]);
  if (req.method === 'POST' && p[0] === 'apagar-evento' && p.length === 2) return apagarEvento(req, env, p[1]);
  return json({ erro: 'Endereço não encontrado.' }, 404);
}

async function receber(req, env, evento, id, versao, url) {
  const limite = VERSOES[versao];
  if (!EVENTO.test(evento) || !ID.test(id) || !limite) return json({ erro: 'Endereço inválido.' }, 400);
  const tipo = req.headers.get('Content-Type') || '';
  if (!tipo.startsWith('image/')) return json({ erro: 'Só dá para enviar imagens.' }, 415);
  const tamanho = Number(req.headers.get('Content-Length'));
  if (!tamanho) return json({ erro: 'Arquivo vazio.' }, 411);
  if (tamanho > limite) return json({ erro: 'Esta foto é grande demais.' }, 413);

  // Nunca sobrescreve: se a mesma versão já chegou (o celular tentou de novo), só confirma.
  const chave = `${evento}/${id}/${versao}`;
  if (!(await env.FOTOS.head(chave))) {
    await env.FOTOS.put(chave, req.body, {
      httpMetadata: { contentType: tipo, cacheControl: 'public, max-age=31536000, immutable' }
    });
  }

  // A foto entra na lista quando chega a versão do telão; o original só marca que existe.
  const agora = Date.now();
  if (versao === 'telao') {
    const autor = (url.searchParams.get('autor') || '').trim().slice(0, 40);
    await env.DB.prepare(
      'INSERT OR IGNORE INTO fotos (id, evento, autor, criada_em, atualizada_em) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, evento, autor, agora, agora).run();
  } else if (versao === 'original') {
    await env.DB.prepare(
      'UPDATE fotos SET tipo_original = ?, atualizada_em = ? WHERE id = ? AND evento = ?'
    ).bind(tipo, agora, id, evento).run();
  }
  return json({ ok: true });
}

async function listar(env, evento, url) {
  if (!EVENTO.test(evento)) return json({ erro: 'Evento inválido.' }, 400);
  const desde = Number(url.searchParams.get('desde')) || 0;
  const { results } = await env.DB.prepare(
    `SELECT id, autor, criada_em, atualizada_em, tipo_original, escondida FROM fotos
     WHERE evento = ? AND atualizada_em >= ? ORDER BY atualizada_em LIMIT ${POR_PAGINA}`
  ).bind(evento, desde).all();
  return json({ fotos: results, porPagina: POR_PAGINA }, 200, { 'Cache-Control': 'no-store' });
}

async function servir(env, evento, id, versao) {
  if (!EVENTO.test(evento) || !ID.test(id) || !VERSOES[versao]) return json({ erro: 'Endereço inválido.' }, 400);
  const objeto = await env.FOTOS.get(`${evento}/${id}/${versao}`);
  if (!objeto) return json({ erro: 'Foto não encontrada.' }, 404);
  const cabecalhos = new Headers(CORS);
  objeto.writeHttpMetadata(cabecalhos);
  cabecalhos.set('ETag', objeto.httpEtag);
  return new Response(objeto.body, { headers: cabecalhos });
}

function autorizado(req, env) {
  const senha = env.SENHA_ORGANIZACAO;
  return Boolean(senha) && req.headers.get('Authorization') === `Bearer ${senha}`;
}

async function esconder(req, env, evento, id) {
  if (!autorizado(req, env)) return json({ erro: 'Senha incorreta.' }, 401);
  await env.DB.prepare('UPDATE fotos SET escondida = 1, atualizada_em = ? WHERE id = ? AND evento = ?')
    .bind(Date.now(), id, evento).run();
  return json({ ok: true });
}

async function apagarEvento(req, env, evento) {
  if (!autorizado(req, env)) return json({ erro: 'Senha incorreta.' }, 401);
  if (!EVENTO.test(evento)) return json({ erro: 'Evento inválido.' }, 400);
  let arquivos = 0, cursor;
  do {
    const pagina = await env.FOTOS.list({ prefix: `${evento}/`, cursor, limit: 1000 });
    if (pagina.objects.length) await env.FOTOS.delete(pagina.objects.map(o => o.key));
    arquivos += pagina.objects.length;
    cursor = pagina.truncated ? pagina.cursor : undefined;
  } while (cursor);
  const { meta } = await env.DB.prepare('DELETE FROM fotos WHERE evento = ?').bind(evento).run();
  return json({ ok: true, arquivos, fotos: meta.changes });
}

function json(dados, status = 200, extra = {}) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', ...extra }
  });
}
