// ═══════════════════════════════════════════════════════════════
// STARTFRANCHISE ARTICLE ENHANCEMENT — RENDER BACKEND
// Database: TiDB Cloud (MySQL)
// Deploy: Render.com
// ═══════════════════════════════════════════════════════════════

import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' }));

// ─── DATABASE ─────────────────────────────────────────────────
const DB_URL = process.env.DATABASE_URL;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

// ─── SQL HELPER: client-side escaping (TiDB compatible) ───────
// TiDB Cloud doesn't handle mysql2 binary protocol parameterized queries.
// We build the SQL string locally with proper escaping instead.
function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  const str = String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\0/g, '\\0');
  return `'${str}'`;
}

function q(sql, vals = []) {
  let i = 0;
  const built = sql.replace(/\?/g, () => esc(vals[i++]));
  return pool.query(built);
}

// ─── PROFANITY FILTER ─────────────────────────────────────────
const BAD_WORDS = [
  'anjing','babi','bangsat','bajingan','brengsek','tolol','goblok','idiot',
  'bodoh','dungu','setan','iblis','laknat','kampret','monyet','tai','kontol',
  'memek','ngentot','pepek','jancok','asu','cok','fuck','shit','bitch',
  'damn','asshole','bastard','dick','pussy','cock','cunt','motherfucker',
  'wtf','stfu','nigga','nigger','retard','slut','whore','homo'
];

function containsProfanity(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return BAD_WORDS.some(w => {
    const regex = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    return regex.test(lower);
  });
}

function censorText(text) {
  if (!text) return text;
  let result = text;
  BAD_WORDS.forEach(w => {
    const regex = new RegExp('\\b(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'gi');
    result = result.replace(regex, (match) => match[0] + '*'.repeat(match.length - 1));
  });
  return result;
}

let pool;

async function initDB() {
  try {
    const url = new URL(DB_URL);
    pool = mysql.createPool({
      host: url.hostname,
      port: parseInt(url.port) || 4000,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace('/', ''),
      ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false },
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 10000
    });

    const conn = await pool.getConnection();
    console.log('✅ Database connected');
    conn.release();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id VARCHAR(20) PRIMARY KEY,
        article_slug VARCHAR(255) NOT NULL,
        parent_id VARCHAR(20) DEFAULT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) DEFAULT '',
        message TEXT NOT NULL,
        likes INT DEFAULT 0,
        dislikes INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_slug (article_slug)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comment_reactions (
        id VARCHAR(20) PRIMARY KEY,
        comment_id VARCHAR(20) NOT NULL,
        user_fingerprint VARCHAR(100) NOT NULL,
        reaction_type ENUM('like','dislike') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_reaction (comment_id, user_fingerprint)
      )
    `);
    console.log('✅ Tables ready');
  } catch (err) {
    console.error('❌ DB Init Error:', err.message);
    throw err;
  }
}

// ─── HEALTH CHECK ─────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', service: 'StartFranchise Article API v2' }));

// ═══════════════════════════════════════════════════════════════
// GET COMMENTS
// ═══════════════════════════════════════════════════════════════
app.get('/api/comments', async (req, res) => {
  try {
    const slug = req.query.slug || '';
    const [rows] = await q(
      'SELECT * FROM comments WHERE article_slug = ? ORDER BY created_at DESC',
      [slug]
    );

    const map = {};
    const roots = [];
    rows.forEach(r => { r.replies = []; map[r.id] = r; });
    rows.forEach(r => {
      if (r.parent_id && map[r.parent_id]) {
        map[r.parent_id].replies.push(r);
      } else {
        roots.push(r);
      }
    });

    res.json(roots);
  } catch (err) {
    console.error('GET /api/comments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADD COMMENT (with profanity filter)
// ═══════════════════════════════════════════════════════════════
app.post('/api/comments', async (req, res) => {
  try {
    const { article_slug, parent_id, name, email, message } = req.body;

    if (!name || !message || !article_slug) {
      return res.status(400).json({ error: 'Nama, pesan, dan slug wajib diisi' });
    }
    if (containsProfanity(name)) {
      return res.status(400).json({ error: 'Nama mengandung kata tidak pantas' });
    }
    if (containsProfanity(message)) {
      return res.status(400).json({ error: 'Komentar mengandung kata tidak pantas. Mohon gunakan bahasa yang sopan.' });
    }

    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const cleanMessage = censorText(message);
    const cleanName = censorText(name);
    const pid = parent_id || null;

    await q(
      'INSERT INTO comments (id, article_slug, parent_id, name, email, message) VALUES (?, ?, ?, ?, ?, ?)',
      [id, article_slug, pid, cleanName, email || '', cleanMessage]
    );

    res.json({ success: true, id });
  } catch (err) {
    console.error('POST /api/comments error:', err.message);
    res.status(500).json({ error: 'Gagal mengirim komentar: ' + err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// DELETE COMMENT
// ═══════════════════════════════════════════════════════════════
app.delete('/api/comments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'ID komentar diperlukan' });

    await q('DELETE FROM comment_reactions WHERE comment_id IN (SELECT id FROM comments WHERE parent_id = ?)', [id]);
    await q('DELETE FROM comments WHERE parent_id = ?', [id]);
    await q('DELETE FROM comment_reactions WHERE comment_id = ?', [id]);
    const [result] = await q('DELETE FROM comments WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Komentar tidak ditemukan' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/comments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// REACT (LIKE/DISLIKE)
// ═══════════════════════════════════════════════════════════════
app.post('/api/react', async (req, res) => {
  try {
    const { comment_id, user_fingerprint, reaction_type } = req.body;
    if (!comment_id || !user_fingerprint || !['like', 'dislike'].includes(reaction_type)) {
      return res.status(400).json({ error: 'Data reaksi tidak valid' });
    }

    const [existing] = await q(
      'SELECT * FROM comment_reactions WHERE comment_id = ? AND user_fingerprint = ?',
      [comment_id, user_fingerprint]
    );

    if (existing.length > 0) {
      const old = existing[0];
      if (old.reaction_type === reaction_type) {
        await q('DELETE FROM comment_reactions WHERE id = ?', [old.id]);
        await q(`UPDATE comments SET ${reaction_type}s = GREATEST(0, ${reaction_type}s - 1) WHERE id = ?`, [comment_id]);
        return res.json({ action: 'removed' });
      } else {
        await q('UPDATE comment_reactions SET reaction_type = ? WHERE id = ?', [reaction_type, old.id]);
        const oldCol = old.reaction_type + 's';
        const newCol = reaction_type + 's';
        await q(`UPDATE comments SET ${oldCol} = GREATEST(0, ${oldCol} - 1), ${newCol} = ${newCol} + 1 WHERE id = ?`, [comment_id]);
        return res.json({ action: 'switched' });
      }
    }

    const rId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    await q(
      'INSERT INTO comment_reactions (id, comment_id, user_fingerprint, reaction_type) VALUES (?, ?, ?, ?)',
      [rId, comment_id, user_fingerprint, reaction_type]
    );
    await q(`UPDATE comments SET ${reaction_type}s = ${reaction_type}s + 1 WHERE id = ?`, [comment_id]);

    res.json({ action: 'added' });
  } catch (err) {
    console.error('POST /api/react error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// AI CHATBOT
// ═══════════════════════════════════════════════════════════════
app.post('/api/chat', async (req, res) => {
  try {
    const { message, articleContent, articleTitle } = req.body;
    if (!message) return res.status(400).json({ error: 'Pesan kosong' });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Kamu adalah asisten AI khusus untuk website StartFranchise.id.

ATURAN KETAT:
1. Kamu HANYA boleh menjawab berdasarkan ISI ARTIKEL yang diberikan di bawah.
2. JANGAN pernah menjawab pertanyaan yang TIDAK ADA jawabannya di dalam artikel.
3. Jika ditanya sesuatu yang tidak ada di artikel, jawab: "Maaf, informasi tersebut tidak tersedia di artikel ini."
4. JANGAN mengarang atau menambahkan informasi dari luar artikel.
5. Jawab dalam Bahasa Indonesia, ramah, ringkas, dan informatif.

══════════════════════════════
JUDUL ARTIKEL: ${articleTitle}

ISI LENGKAP ARTIKEL:
${articleContent}
══════════════════════════════`
          },
          { role: 'user', content: message }
        ],
        max_tokens: 1000,
        temperature: 0.3
      })
    });

    const data = await response.json();
    if (data.error) return res.json({ error: data.error.message });
    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    res.json({ error: 'AI service error: ' + err.message });
  }
});

// ─── START ────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}).catch(err => {
  console.error('❌ Fatal DB Error:', err.message);
  app.listen(PORT, () => console.log(`⚠️ Server on port ${PORT} (DB disconnected)`));
});
