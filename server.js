/* =====================================================================
   Servidor de captação de clientes
   ---------------------------------------------------------------------
   - Serve o formulário (public/index.html)
   - Recebe POST /api/submit com os dados do cliente
   - Grava no banco Neon (Postgres)
   - Dispara um aviso no Slack (DM) para a pessoa configurada

   Segredos vêm SEMPRE de variáveis de ambiente (nunca no código):
     DATABASE_URL        -> string de conexão do Neon
     SLACK_BOT_TOKEN     -> token do bot do Slack (começa com xoxb-)
     SLACK_TARGET_ID     -> ID do usuário/canal que recebe o aviso (ex.: U0895CZ8HU7)
     PORT                -> porta (o Render define automaticamente)
   ===================================================================== */

import express from 'express';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  DATABASE_URL,
  SLACK_BOT_TOKEN,
  PORT = 3000,
} = process.env;

/* ---------- Roteamento do Slack por cidade ---------- */
// Destinos (podem ser sobrescritos por variáveis de ambiente, se um dia mudar).
const SLACK_ID_REGIAO_A = process.env.SLACK_ID_REGIAO_A || 'U0AHTBS64KH';
const SLACK_ID_REGIAO_B = process.env.SLACK_ID_REGIAO_B || 'U087HG1B4DB';
const SLACK_ID_PADRAO   = process.env.SLACK_ID_PADRAO   || 'U07LP4JSN9K';

const CIDADES_REGIAO_A = [
  'Palmeira dos Índios', 'Igaci', 'Major Isidoro', 'Quebrangulo',
  'Estrela de Alagoas', 'Minador do Negrão', 'Cacimbinhas',
];
const CIDADES_REGIAO_B = [
  'Penedo', 'Igreja Nova', 'São Brás', 'Porto Real do Colégio', 'São Sebastião',
  'Junqueiro', 'Teotônio Vilela', 'Piaçabuçu', 'Feliz Deserto', 'Coruripe',
];

// Normaliza a cidade: remove acentos, tira o sufixo " / AL", minúsculas.
function normCidade(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s*\/.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
const SET_A = new Set(CIDADES_REGIAO_A.map(normCidade));
const SET_B = new Set(CIDADES_REGIAO_B.map(normCidade));

// Extrai o estado (UF) do final da cidade, se vier no formato "Cidade / AL".
function ufDaCidade(s) {
  const m = (s || '').match(/\/\s*([A-Za-z]{2})\s*$/);
  return m ? m[1].toUpperCase() : null;
}

// Decide para qual Slack ID o cadastro deve ir, conforme a cidade.
// Todas as cidades das regiões A e B são de Alagoas (AL): se vier um CEP de
// cidade de mesmo nome em OUTRO estado, vai para o Padrão (não para o regional).
function destinoSlack(cidade) {
  const uf = ufDaCidade(cidade);
  if (uf && uf !== 'AL') return { id: SLACK_ID_PADRAO, regiao: 'Padrão' };
  const c = normCidade(cidade);
  if (SET_A.has(c)) return { id: SLACK_ID_REGIAO_A, regiao: 'Região A' };
  if (SET_B.has(c)) return { id: SLACK_ID_REGIAO_B, regiao: 'Região B' };
  return { id: SLACK_ID_PADRAO, regiao: 'Padrão' };
}

/* ---------- Banco de dados (Neon / Postgres) ---------- */
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon exige SSL
});

/* Cria a tabela na primeira execução (se ainda não existir). */
async function initDb() {
  if (!DATABASE_URL) {
    console.warn('[AVISO] DATABASE_URL não definida — o banco não será usado.');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id         SERIAL PRIMARY KEY,
      nome       TEXT,
      cpf        TEXT,
      telefone   TEXT,
      cep        TEXT,
      rua        TEXT,
      bairro     TEXT,
      cidade     TEXT,
      criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('[OK] Tabela "clientes" pronta.');
}

async function salvarCliente(c) {
  if (!DATABASE_URL) return null;
  const q = `
    INSERT INTO clientes (nome, cpf, telefone, cep, rua, bairro, cidade)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, criado_em;
  `;
  const v = [c.nome, c.cpf, c.telefone, c.cep, c.rua, c.bairro, c.cidade];
  const r = await pool.query(q, v);
  return r.rows[0];
}

/* ---------- Slack ---------- */
async function avisarSlack(c, dbInfo) {
  if (!SLACK_BOT_TOKEN) {
    console.warn('[AVISO] SLACK_BOT_TOKEN não definido — Slack não será notificado.');
    return;
  }
  // Escolhe o destino conforme a cidade do cadastro.
  const destino = destinoSlack(c.cidade);

  const linha = (rotulo, valor) => `*${rotulo}:* ${valor || '—'}`;
  const endereco = [c.rua, c.bairro].filter(Boolean).join(', ');
  const texto = [
    `🎉 *Novo cliente captado!* _(${destino.regiao})_`,
    linha('Nome', c.nome),
    linha('CPF', c.cpf),
    linha('Telefone', c.telefone),
    linha('Endereço', endereco),
    linha('Cidade', c.cidade),
    linha('CEP', c.cep),
    dbInfo ? `_Registro #${dbInfo.id}_` : '',
  ].filter(Boolean).join('\n');

  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({
      channel: destino.id, // user ID (DM) ou channel ID, conforme a região
      text: texto,
    }),
  });
  const data = await resp.json();
  if (!data.ok) {
    // Erros comuns: not_in_channel, channel_not_found, missing_scope, invalid_auth
    console.error(`[ERRO Slack] ${destino.regiao} (${destino.id}):`, data.error);
  } else {
    console.log(`[OK] Slack notificado -> ${destino.regiao} (${destino.id}).`);
  }
}

/* ---------- App ---------- */
const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* Saúde do servidor (útil para testar se está no ar) */
app.get('/health', (_req, res) => res.json({ ok: true }));

/* Recebe os dados do formulário */
app.post('/api/submit', async (req, res) => {
  const b = req.body || {};
  const cliente = {
    nome: String(b.nome || '').trim().slice(0, 200),
    cpf: String(b.cpf || '').trim().slice(0, 20),
    telefone: String(b.telefone || '').trim().slice(0, 30),
    cep: String(b.cep || '').trim().slice(0, 12),
    rua: String(b.rua || '').trim().slice(0, 200),
    bairro: String(b.bairro || '').trim().slice(0, 200),
    cidade: String(b.cidade || '').trim().slice(0, 200),
  };

  if (!cliente.nome) {
    return res.status(400).json({ ok: false, error: 'nome obrigatório' });
  }

  // Responde IMEDIATAMENTE para a tela de sucesso aparecer sem atraso.
  // A gravação no banco e o aviso no Slack acontecem em segundo plano —
  // o cliente não precisa esperar por eles.
  res.json({ ok: true });

  (async () => {
    let dbInfo = null;
    try {
      dbInfo = await salvarCliente(cliente);
    } catch (e) {
      console.error('[ERRO Banco]', e.message);
    }
    try {
      await avisarSlack(cliente, dbInfo);
    } catch (e) {
      console.error('[ERRO Slack]', e.message);
    }
  })();
});

initDb()
  .catch((e) => console.error('[ERRO ao iniciar o banco]', e.message))
  .finally(() => {
    app.listen(PORT, () => console.log(`[OK] Servidor no ar em http://localhost:${PORT}`));
  });
