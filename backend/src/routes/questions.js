const express = require('express');
const router = express.Router();
const { run, get, all } = require('../database');
const mlService = require('../services/mercadolibre');

router.get('/rules', async (req, res) => {
  try {
    const rules = await all('SELECT * FROM auto_replies ORDER BY created_at DESC');
    res.json(rules.map(r => ({ ...r, keywords: JSON.parse(r.keywords || '[]') })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/rules', async (req, res) => {
  try {
    const { name, keywords, response_template, match_type = 'any' } = req.body;
    if (!name || !keywords || !response_template) return res.status(400).json({ error: 'Faltan campos requeridos' });
    const kwArray = Array.isArray(keywords) ? keywords : keywords.split(',').map(k => k.trim()).filter(Boolean);
    const now = new Date().toISOString();
    const result = await run(
      'INSERT INTO auto_replies (name, keywords, response_template, match_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [name, JSON.stringify(kwArray), response_template, match_type, now, now]
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/rules/:id', async (req, res) => {
  try {
    const { name, keywords, response_template, match_type, is_active } = req.body;
    let kwJson = null;
    if (keywords) {
      const kwArray = Array.isArray(keywords) ? keywords : keywords.split(',').map(k => k.trim()).filter(Boolean);
      kwJson = JSON.stringify(kwArray);
    }
    await run(
      `UPDATE auto_replies SET
        name=COALESCE(?,name), keywords=COALESCE(?,keywords),
        response_template=COALESCE(?,response_template), match_type=COALESCE(?,match_type),
        is_active=COALESCE(?,is_active), updated_at=? WHERE id=?`,
      [name || null, kwJson, response_template || null, match_type || null,
       is_active !== undefined ? (is_active ? 1 : 0) : null,
       new Date().toISOString(), req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/rules/:id', async (req, res) => {
  try {
    await run('DELETE FROM auto_replies WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { status = 'UNANSWERED', offset = 0, limit = 20 } = req.query;
    const data = await mlService.getQuestions(status, parseInt(offset), parseInt(limit));
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:questionId/reply', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Se requiere texto de respuesta' });
    await mlService.answerQuestion(req.params.questionId, text);
    await run(
      'INSERT OR REPLACE INTO question_logs (ml_question_id, answer_text, auto_replied, created_at) VALUES (?, ?, 0, ?)',
      [req.params.questionId, text, new Date().toISOString()]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/auto-check', async (req, res) => {
  try {
    const rules = await all('SELECT * FROM auto_replies WHERE is_active = 1');
    const data = await mlService.getQuestions('UNANSWERED', 0, 50);
    const questions = data.questions || [];
    let replied = 0;
    for (const q of questions) {
      const alreadyReplied = await get('SELECT id FROM question_logs WHERE ml_question_id = ?', [String(q.id)]);
      if (alreadyReplied) continue;
      const questionText = (q.text || '').toLowerCase();
      for (const rule of rules) {
        const keywords = JSON.parse(rule.keywords || '[]');
        if (keywords.length === 0) continue;
        const match = rule.match_type === 'all'
          ? keywords.every(kw => questionText.includes(kw.toLowerCase()))
          : keywords.some(kw => questionText.includes(kw.toLowerCase()));
        if (match) {
          try {
            await mlService.answerQuestion(q.id, rule.response_template);
            await run(
              'INSERT OR IGNORE INTO question_logs (ml_question_id, item_id, question_text, answer_text, auto_replied, reply_rule_id, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
              [String(q.id), q.item_id, q.text, rule.response_template, rule.id, new Date().toISOString()]
            );
            replied++;
            break;
          } catch (e) { /* skip failed */ }
        }
      }
    }
    res.json({ success: true, replied, checked: questions.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/logs', async (req, res) => {
  try {
    const logs = await all('SELECT * FROM question_logs ORDER BY created_at DESC LIMIT 50');
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
