/*
  CONFIGURAÇÃO DO EVENTO
  Este é o único arquivo que você precisa editar para cada festa.
*/
window.EVENTO = {
  // Identificador do evento (só letras minúsculas, números e hífen). Cada festa precisa de um diferente.
  slug: 'debutante-marina-15',

  // Textos que aparecem nas páginas
  nome: 'Marina',
  titulo: 'Os 15 anos da Marina',
  data: 'Sábado, 14 de novembro de 2026',
  mensagem: 'Tirou foto? Manda aqui! Ela aparece no telão na hora e fica guardada no álbum da Marina.',

  // Depois de publicar o site na Vercel, cole aqui o endereço da página dos convidados.
  // Exemplo: 'https://fotos-marina.vercel.app/'
  // Enquanto estiver vazio, o QR code aponta para o endereço atual do navegador.
  linkDoSite: 'https://site-fotos-henna.vercel.app/',

  // Qualidade (veja o LEIA-ME). O ORIGINAL de cada foto é sempre guardado sem alteração;
  // estes números valem só para as versões de exibição.
  tamanhoTelao: 2048,    // maior lado da versão do telão, em pixels
  qualidade: 0.82,       // de 0 a 1
  tamanhoMiniatura: 480, // versão pequena usada na galeria, para economizar internet

  // Telão e galeria
  segundosPorFotoNoTelao: 7,
  telaoBuscaFotosACada: 3,   // segundos
  galeriaBuscaFotosACada: 10, // segundos (mais espaçado: são muitos celulares)

  // Endereço do servidor de fotos na Cloudflare (aparece ao rodar "npm run publicar" na pasta cloudflare).
  // Exemplo: 'https://fotos-festa.seu-usuario.workers.dev'
  // Deixe vazio para usar o MODO DEMONSTRAÇÃO (as fotos ficam só no navegador onde foram enviadas).
  apiUrl: ''
};
