/*
  FOTOS.JS
  Cuida de três coisas:
  1. Preparar cada foto no celular do convidado: o ORIGINAL fica intacto, e são criadas
     uma versão para o telão e uma miniatura para a galeria.
  2. Guardar e listar as fotos: no MODO DEMONSTRAÇÃO (IndexedDB, só neste navegador)
     ou na CLOUDFLARE (de verdade, todos os celulares).
  3. Avisar as páginas quando chega foto nova.
*/
(function () {
  const cfg = window.EVENTO;
  const api = (cfg.apiUrl || '').replace(/\/+$/, '');
  const modo = api ? 'cloudflare' : 'demo';
  const canal = 'BroadcastChannel' in window ? new BroadcastChannel('fotos-' + cfg.slug) : null;
  // Ordem de envio: as leves primeiro, para a foto aparecer no telão em segundos.
  const ORDEM = ['miniatura', 'telao', 'original'];

  function gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function tipoDoArquivo(arquivo) {
    if (arquivo.type) return arquivo.type;
    if (/\.hei[cf]$/i.test(arquivo.name || '')) return 'image/heic';
    return 'image/jpeg';
  }

  /* ---------- Modo demonstração (IndexedDB) ---------- */
  let dbPromise;
  function abrirDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('fotos-evento-demo', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('fotos', { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  function transacao(modoTx, fn) {
    return abrirDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction('fotos', modoTx);
      const req = fn(t.objectStore('fotos'));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  const urlsDemo = new Map();
  const demo = {
    async enviar(pacote, autor, aoAvancar) {
      const { id, original, telao, miniatura } = pacote;
      await transacao('readwrite', s => s.put({ id, evento: cfg.slug, autor, criadaEm: Date.now(), original, telao, miniatura }));
      if (canal) canal.postMessage('nova-foto');
      for (const versao of ORDEM) {
        pacote.concluidas.add(versao);
        if (aoAvancar) aoAvancar(versao);
      }
    },
    async listar() {
      const todas = await transacao('readonly', s => s.getAll());
      return todas
        .filter(f => f.evento === cfg.slug)
        .sort((a, b) => b.criadaEm - a.criadaEm)
        .map(f => {
          if (!urlsDemo.has(f.id)) {
            const telao = f.telao || f.foto || f.blob; // fotos salvas por versões anteriores da prévia
            urlsDemo.set(f.id, {
              url: URL.createObjectURL(telao),
              miniatura: URL.createObjectURL(f.miniatura || telao),
              original: URL.createObjectURL(f.original || telao)
            });
          }
          return { id: f.id, autor: f.autor, criadaEm: f.criadaEm, ...urlsDemo.get(f.id) };
        });
    }
  };

  /* ---------- Modo real (Cloudflare) ---------- */
  const ESPERAS = [1000, 3000, 8000]; // novas tentativas quando a internet do salão oscila

  async function pedir(caminho, opcoes) {
    let resp;
    try {
      resp = await fetch(api + caminho, opcoes);
    } catch (_) {
      throw new Error('Sem conexão com o servidor de fotos.');
    }
    if (!resp.ok) {
      const corpo = await resp.json().catch(() => ({}));
      const erro = new Error(corpo.erro || `Erro ${resp.status}`);
      // Erro do tipo "foto inválida" não adianta repetir; queda de rede e servidor ocupado, sim.
      erro.definitivo = resp.status >= 400 && resp.status < 500 && resp.status !== 408 && resp.status !== 429;
      throw erro;
    }
    return resp;
  }

  async function comTentativas(fn) {
    for (let i = 0; ; i++) {
      try {
        return await fn();
      } catch (erro) {
        if (erro.definitivo || i >= ESPERAS.length) throw erro;
        await new Promise(r => setTimeout(r, ESPERAS[i]));
      }
    }
  }

  const arquivo = (id, versao) => `${api}/arquivo/${cfg.slug}/${id}/${versao}`;
  const conhecidas = new Map();
  let desde = 0;

  const cloudflare = {
    async enviar(pacote, autor, aoAvancar) {
      for (const versao of ORDEM) {
        if (pacote.concluidas.has(versao)) continue; // ao tentar de novo, só manda o que faltou
        const blob = pacote[versao];
        const busca = versao === 'telao' && autor ? '?autor=' + encodeURIComponent(autor) : '';
        await comTentativas(() => pedir(`/envio/${cfg.slug}/${pacote.id}/${versao}${busca}`, {
          method: 'PUT', body: blob, headers: { 'Content-Type': tipoDoArquivo(blob) }
        }));
        pacote.concluidas.add(versao);
        if (aoAvancar) aoAvancar(versao);
      }
    },
    // Só busca o que mudou desde a última vez: a lista inteira nunca é baixada de novo.
    async listar() {
      while (true) {
        const anterior = desde;
        const { fotos, porPagina } = await (await pedir(`/fotos/${cfg.slug}?desde=${desde}`, { cache: 'no-store' })).json();
        for (const f of fotos) {
          desde = Math.max(desde, f.atualizada_em);
          if (f.escondida) { conhecidas.delete(f.id); continue; }
          conhecidas.set(f.id, {
            id: f.id,
            autor: f.autor,
            criadaEm: f.criada_em,
            url: arquivo(f.id, 'telao'),
            miniatura: arquivo(f.id, 'miniatura'),
            original: arquivo(f.id, f.tipo_original ? 'original' : 'telao')
          });
        }
        if (fotos.length < porPagina || desde === anterior) break;
      }
      return [...conhecidas.values()].sort((a, b) => b.criadaEm - a.criadaEm);
    }
  };

  const armazenamento = api ? cloudflare : demo;

  /* ---------- Preparação ---------- */
  function carregarImagem(arquivo) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Este formato de imagem não abre neste navegador. Tente uma foto em JPG ou PNG.'));
      };
      img.src = url;
    });
  }

  async function paraJpeg(fonte, largura, altura, ladoMaximo, qualidade) {
    const escala = Math.min(1, ladoMaximo / Math.max(largura, altura));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(largura * escala);
    canvas.height = Math.round(altura * escala);
    canvas.getContext('2d').drawImage(fonte, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', qualidade));
    if (!blob) throw new Error('Não foi possível preparar esta foto.');
    return blob;
  }

  // Devolve o pacote de envio: o arquivo original sem nenhuma alteração,
  // a versão do telão e a miniatura da galeria.
  async function preparar(arquivo) {
    let fonte, largura, altura;
    try {
      fonte = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
      largura = fonte.width; altura = fonte.height;
    } catch (_) {
      fonte = await carregarImagem(arquivo);
      largura = fonte.naturalWidth; altura = fonte.naturalHeight;
    }
    try {
      return {
        id: gerarId(),
        concluidas: new Set(),
        original: arquivo,
        telao: await paraJpeg(fonte, largura, altura, cfg.tamanhoTelao, cfg.qualidade),
        miniatura: await paraJpeg(fonte, largura, altura, cfg.tamanhoMiniatura, 0.72)
      };
    } finally {
      if (fonte.close) fonte.close();
    }
  }

  /* ---------- Utilidades ---------- */
  function aoMudar(callback, segundos) {
    if (canal) canal.onmessage = () => callback();
    // Celular com a tela apagada não fica perguntando ao servidor.
    setInterval(() => { if (!document.hidden) callback(); }, segundos * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) callback(); });
  }

  function linkDoSite() {
    return cfg.linkDoSite || new URL('index.html', location.href).href;
  }

  function tempoRelativo(ts) {
    const min = Math.round((Date.now() - ts) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    return h < 24 ? `há ${h} h` : new Date(ts).toLocaleDateString('pt-BR');
  }

  window.Fotos = {
    modo,
    preparar,
    enviar: (pacote, autor, aoAvancar) => armazenamento.enviar(pacote, autor, aoAvancar),
    listar: () => armazenamento.listar(),
    aoMudar, linkDoSite, tempoRelativo
  };
})();
