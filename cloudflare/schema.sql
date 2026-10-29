-- Uma linha por foto. Os arquivos ficam no R2, em <evento>/<id>/<miniatura|telao|original>.
CREATE TABLE IF NOT EXISTS fotos (
  id TEXT PRIMARY KEY,
  evento TEXT NOT NULL,
  autor TEXT NOT NULL DEFAULT '',
  criada_em INTEGER NOT NULL,
  atualizada_em INTEGER NOT NULL,   -- muda quando chega o original ou a foto é escondida
  tipo_original TEXT,               -- vazio até o original terminar de subir
  escondida INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS fotos_por_evento ON fotos (evento, atualizada_em);
