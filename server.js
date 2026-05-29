const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'seu_segredo_super_secreto_aqui_123';

// Configurar PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Erro no pool do banco:', err);
});

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL || '*']
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(express.static('public'));

// =====================
// INICIALIZAR BANCO
// =====================

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        team_a VARCHAR(255) NOT NULL,
        team_b VARCHAR(255) NOT NULL,
        result_a INTEGER,
        result_b INTEGER,
        status VARCHAR(50) DEFAULT 'open',
        created_by INTEGER NOT NULL REFERENCES users(id),
        round VARCHAR(255),
        winner_id INTEGER REFERENCES users(id),
        main_prize NUMERIC(10,2) DEFAULT 0,
        fun_prize NUMERIC(10,2) DEFAULT 0,
        bet_value NUMERIC(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP,
        lock_at TIMESTAMP
      )
    `);

    // Migrações para bancos já existentes
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS bet_value NUMERIC(10,2) DEFAULT 0`);
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS lock_at TIMESTAMP`);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'contributors_game_user_unique'
        ) THEN
          ALTER TABLE contributors ADD CONSTRAINT contributors_game_user_unique UNIQUE (game_id, user_id);
        END IF;
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bets (
        id SERIAL PRIMARY KEY,
        game_id INTEGER NOT NULL REFERENCES games(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        result_a INTEGER NOT NULL,
        result_b INTEGER NOT NULL,
        goals_team_a TEXT,
        goals_team_b TEXT,
        yellow_a VARCHAR(255),
        red_a VARCHAR(255),
        yellow_b VARCHAR(255),
        red_b VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contributors (
        id SERIAL PRIMARY KEY,
        game_id INTEGER NOT NULL REFERENCES games(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        amount NUMERIC(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Banco de dados inicializado!');
  } catch (err) {
    console.error('❌ Erro ao inicializar banco:', err);
  }
}

initializeDatabase();

// Auto-lock jogos que passaram do horário
async function autoLockGames() {
  await pool.query(`
    UPDATE games SET status = 'locked'
    WHERE status = 'open' AND lock_at IS NOT NULL AND lock_at <= NOW()
  `);
}

// =====================
// MIDDLEWARE
// =====================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};

// =====================
// AUTENTICAÇÃO
// =====================

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username e password obrigatórios' });
  }

  try {
    const countResult = await pool.query('SELECT COUNT(*) as count FROM users');
    const is_admin = parseInt(countResult.rows[0].count) === 0 ? 1 : 0;
    const hashed = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3) RETURNING id, username, is_admin',
      [username, hashed, is_admin]
    );
    
    const user = result.rows[0];
    const token = jwt.sign({ 
      id: user.id, 
      username: user.username, 
      is_admin: user.is_admin === 1 
    }, SECRET_KEY);
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        is_admin: user.is_admin === 1 
      } 
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Usuário já existe' });
    }
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    
    if (!user) {
      return res.status(400).json({ error: 'Usuário não encontrado' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ error: 'Senha incorreta' });
    }

    const is_admin = user.is_admin === 1;
    const token = jwt.sign({ 
      id: user.id, 
      username: user.username, 
      is_admin 
    }, SECRET_KEY);
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        is_admin 
      } 
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =====================
// JOGOS
// =====================

app.get('/api/games', authenticateToken, async (req, res) => {
  try {
    await autoLockGames();
    const result = await pool.query('SELECT * FROM games ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/games/:id', authenticateToken, async (req, res) => {
  const gameId = req.params.id;
  
  try {
    const gameResult = await pool.query('SELECT * FROM games WHERE id = $1', [gameId]);
    const game = gameResult.rows[0];
    
    if (!game) {
      return res.status(404).json({ error: 'Jogo não encontrado' });
    }

    // Apostas visíveis a todos só quando o jogo estiver fechado. Antes disso, cada um vê só a sua.
    const isAdmin = req.user.is_admin;
    const betsQuery = (isAdmin || game.status === 'closed')
      ? { text: 'SELECT b.*, u.username FROM bets b LEFT JOIN users u ON b.user_id = u.id WHERE b.game_id = $1', values: [gameId] }
      : { text: 'SELECT b.*, u.username FROM bets b LEFT JOIN users u ON b.user_id = u.id WHERE b.game_id = $1 AND b.user_id = $2', values: [gameId, req.user.id] };

    const betsResult = await pool.query(betsQuery);
    
    const contributorsResult = await pool.query(
      'SELECT c.*, u.username FROM contributors c LEFT JOIN users u ON c.user_id = u.id WHERE c.game_id = $1',
      [gameId]
    );

    res.json({
      game,
      bets: betsResult.rows,
      contributors: contributorsResult.rows
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/games', authenticateToken, async (req, res) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Apenas administradores podem criar jogos' });
  }

  const { name, team_a, team_b, bet_value, round, lock_at } = req.body;

  try {
    const gameResult = await pool.query(
      'INSERT INTO games (name, team_a, team_b, created_by, round, bet_value, lock_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, team_a, team_b, status, bet_value, lock_at',
      [name, team_a, team_b, req.user.id, round, bet_value || 0, lock_at || null]
    );

    res.json(gameResult.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =====================
// BLOQUEAR APOSTAS
// =====================

app.post('/api/games/:id/lock', authenticateToken, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin only' });
  try {
    await pool.query(
      "UPDATE games SET status = 'locked' WHERE id = $1 AND status = 'open'",
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =====================
// APAGAR JOGO
// =====================

app.delete('/api/games/:id', authenticateToken, async (req, res) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Apenas administradores podem apagar jogos' });
  }
  const gameId = req.params.id;
  try {
    await pool.query('DELETE FROM contributors WHERE game_id = $1', [gameId]);
    await pool.query('DELETE FROM bets WHERE game_id = $1', [gameId]);
    await pool.query('DELETE FROM games WHERE id = $1', [gameId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =====================
// APOSTAS
// =====================

app.post('/api/games/:id/bets', authenticateToken, async (req, res) => {
  const { result_a, result_b, goals_team_a, goals_team_b, yellow_a, red_a, yellow_b, red_b } = req.body;
  const gameId = req.params.id;

  try {
    await autoLockGames();
    const gameCheck = await pool.query('SELECT status FROM games WHERE id = $1', [gameId]);
    if (!gameCheck.rows[0] || gameCheck.rows[0].status !== 'open') {
      return res.status(400).json({ error: 'Apostas encerradas para este jogo' });
    }
    const result = await pool.query(
      `INSERT INTO bets (game_id, user_id, result_a, result_b, goals_team_a, goals_team_b, yellow_a, red_a, yellow_b, red_b)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [gameId, req.user.id, result_a, result_b, goals_team_a, goals_team_b, yellow_a, red_a, yellow_b, red_b]
    );

    // Registrar contribuição do apostador com o valor definido pelo admin
    const gameResult = await pool.query('SELECT bet_value FROM games WHERE id = $1', [gameId]);
    const betValue = parseFloat(gameResult.rows[0]?.bet_value || 0);
    if (betValue > 0) {
      await pool.query(
        'INSERT INTO contributors (game_id, user_id, amount) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [gameId, req.user.id, betValue]
      );
    }

    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =====================
// FECHAR JOGO
// =====================

app.post('/api/games/:id/close', authenticateToken, async (req, res) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Apenas administradores podem fechar jogos' });
  }

  const { result_a, result_b, goals_a, goals_b, yellow_a, red_a, yellow_b, red_b } = req.body;
  const gameId = req.params.id;
  
  try {
    await pool.query(
      `UPDATE games SET status = 'closed', result_a = $1, result_b = $2, closed_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [result_a, result_b, gameId]
    );
    
    const betsResult = await pool.query(
      `SELECT b.*, u.username, u.id as user_id FROM bets b
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.game_id = $1`,
      [gameId]
    );
    
    const contributorsResult = await pool.query(
      `SELECT SUM(amount) as total FROM contributors WHERE game_id = $1`,
      [gameId]
    );
    
    const total = parseFloat(contributorsResult.rows[0]?.total || 0);
    const mainPrize = total * 0.8;
    const funPrize = total * 0.2;
    
    const winners = betsResult.rows.filter(b => b.result_a === result_a && b.result_b === result_b);
    let mainWinner = null;
    
    if (winners.length === 1) {
      mainWinner = winners[0];
    } else if (winners.length > 1) {
      const goalsMatch = winners.filter(b => {
        const bGoalsA = b.goals_team_a ? b.goals_team_a.split(',').length : 0;
        const bGoalsB = b.goals_team_b ? b.goals_team_b.split(',').length : 0;
        const actualGoalsA = goals_a ? goals_a.split(',').length : 0;
        const actualGoalsB = goals_b ? goals_b.split(',').length : 0;
        return bGoalsA === actualGoalsA && bGoalsB === actualGoalsB;
      });
      
      if (goalsMatch.length === 1) {
        mainWinner = goalsMatch[0];
      } else if (goalsMatch.length > 1) {
        const cardsMatch = goalsMatch.filter(b => {
          return b.yellow_a === yellow_a && b.red_a === red_a &&
                 b.yellow_b === yellow_b && b.red_b === red_b;
        });
        if (cardsMatch.length > 0) {
          mainWinner = cardsMatch[0];
        }
      }
    }
    
    if (mainWinner) {
      await pool.query(
        'UPDATE games SET winner_id = $1, main_prize = $2, fun_prize = $3 WHERE id = $4',
        [mainWinner.user_id, mainPrize, funPrize, gameId]
      );
    }
    
    res.json({
      mainPrize,
      funPrize,
      mainWinner: mainWinner ? { id: mainWinner.user_id, username: mainWinner.username } : null,
      message: mainWinner ? `${mainWinner.username} ganhou €${mainPrize.toFixed(2)}!` : 'Nenhum vencedor para o prêmio principal'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =====================
// STATS
// =====================

app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT g.id) as total_games,
        SUM(c.amount) as total_raised,
        MAX(g.main_prize) as largest_prize,
        COUNT(DISTINCT u.id) as total_players
      FROM games g
      LEFT JOIN contributors c ON g.id = c.game_id
      LEFT JOIN users u ON c.user_id = u.id
    `);
    
    const topWinnerResult = await pool.query(`
      SELECT u.username, SUM(g.main_prize) as total_won
      FROM games g
      JOIN users u ON g.winner_id = u.id
      WHERE g.status = 'closed'
      GROUP BY g.winner_id
      ORDER BY total_won DESC
      LIMIT 1
    `);
    
    const row = statsResult.rows[0];
    res.json({
      total_games: row.total_games || 0,
      total_raised: row.total_raised || 0,
      largest_prize: row.largest_prize || 0,
      total_players: row.total_players || 0,
      top_winner: topWinnerResult.rows[0] || null
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/leaderboard', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        COUNT(DISTINCT CASE WHEN b.game_id IS NOT NULL THEN b.game_id END) as bets_made,
        COUNT(DISTINCT CASE WHEN g.winner_id = u.id THEN g.id END) as wins,
        SUM(CASE WHEN g.winner_id = u.id THEN g.main_prize ELSE 0 END) as total_won,
        ROUND(COUNT(DISTINCT CASE WHEN g.winner_id = u.id THEN g.id END) * 100.0 / 
          NULLIF(COUNT(DISTINCT CASE WHEN b.game_id IS NOT NULL THEN b.game_id END), 0), 1) as win_rate
      FROM users u
      LEFT JOIN bets b ON u.id = b.user_id
      LEFT JOIN games g ON b.game_id = g.id
      WHERE u.is_admin = 0
      GROUP BY u.id
      ORDER BY total_won DESC, win_rate DESC
    `);
    
    res.json(result.rows || []);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/user-stats/:userId', authenticateToken, async (req, res) => {
  const userId = req.params.userId;
  
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        COUNT(DISTINCT b.game_id) as total_bets,
        COUNT(DISTINCT CASE WHEN g.winner_id = u.id THEN g.id END) as wins,
        SUM(CASE WHEN g.winner_id = u.id THEN g.main_prize ELSE 0 END) as total_prizes,
        SUM(CASE WHEN g.winner_id = u.id THEN g.fun_prize ELSE 0 END) as fun_prizes
      FROM users u
      LEFT JOIN bets b ON u.id = b.user_id
      LEFT JOIN games g ON b.game_id = g.id AND g.status = 'closed'
      WHERE u.id = $1
      GROUP BY u.id
    `, [userId]);
    
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/export-csv', authenticateToken, async (req, res) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Apenas administradores' });
  }

  try {
    const result = await pool.query(`
      SELECT 
        g.id,
        g.name,
        g.team_a,
        g.team_b,
        g.result_a,
        g.result_b,
        g.status,
        u.username as user,
        b.result_a as bet_a,
        b.result_b as bet_b,
        b.goals_team_a,
        b.goals_team_b,
        b.yellow_a,
        b.red_a,
        b.yellow_b,
        b.red_b
      FROM games g
      LEFT JOIN bets b ON g.id = b.game_id
      LEFT JOIN users u ON b.user_id = u.id
      ORDER BY g.id, u.username
    `);
    
    let csv = 'Jogo,Time A,Time B,Resultado,Status,Apostador,Palpite,Gols A,Gols B,Amarelo A,Vermelho A,Amarelo B,Vermelho B\n';
    
    result.rows.forEach(row => {
      csv += `"${row.name}","${row.team_a}","${row.team_b}","${row.result_a || '-'} x ${row.result_b || '-'}","${row.status}","${row.user || ''}","${row.bet_a || '-'} x ${row.bet_b || '-'}","${row.goals_team_a || ''}","${row.goals_team_b || ''}","${row.yellow_a || ''}","${row.red_a || ''}","${row.yellow_b || ''}","${row.red_b || ''}"\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="baianobetapp_apostas.csv"');
    res.send(csv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🎲 BaianoBet rodando em http://localhost:${PORT}`);
});
