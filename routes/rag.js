const express = require('express');
const { body, validationResult } = require('express-validator');
const BookChunk = require('../models/BookChunk');
const { writeLimiter } = require('../middleware/security');
const { asyncHandler, AppError } = require('../utils/asyncHandler');

const router = express.Router();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function extractKeywords(text) {
  const stopWords = new Set(['what', 'which', 'when', 'where', 'how', 'why', 'the', 'and', 'or', 'is', 'are', 'was', 'were', 'this', 'that', 'these', 'those', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'about', 'kya', 'kaise', 'kab', 'kahan', 'kyun', 'hai', 'hain', 'mein', 'ki', 'ka', 'ke', 'se', 'aur']);
  return text.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w)).slice(0, 8);
}

router.post('/ask', writeLimiter, [
  body('question').isString().trim().isLength({ min: 3, max: 2000 }),
  body('subject').optional().isString().trim().isLength({ max: 80 }),
  body('history').optional().isArray({ max: 10 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

  if (!process.env.GROQ_API_KEY) throw new AppError('AI not configured', 503);

  const { question, subject, history = [] } = req.body;

  const keywords = extractKeywords(question);
  let chunks = [];

  if (keywords.length) {
    const query = { $or: keywords.map(k => ({ text: { $regex: k, $options: 'i' } })) };
    if (subject) query.subject = subject;
    chunks = await BookChunk.find(query).limit(6).lean();
  }

  const bookContext = chunks.length
    ? chunks.map((c, i) => `--- Book Excerpt ${i + 1} (${c.subject}${c.chapter ? ' - ' + c.chapter : ''}) ---\n${c.text}`).join('\n\n')
    : 'No specific book content found for this question.';

  const systemPrompt = `You are an expert tutor for Pakistani 12th class (Class XII) students following the Karachi Board (BIEK) syllabus.

CRITICAL RULES:
1. If book excerpts are provided below, ALWAYS base your answer on them first. Quote directly when possible.
2. If question is about Math/Physics, show formulas clearly and step-by-step solutions.
3. For numericals, solve in steps: Given → Formula → Substitution → Answer with units.
4. Use simple English with occasional Urdu words for better understanding.
5. Keep answers under 400 words unless asked for detailed explanation.
6. Provide memory tricks/mnemonics when relevant.
7. Include "Key Point:" section at end for important takeaways.

BOOK EXCERPTS FROM STUDENT'S TEXTBOOK:
${bookContext}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6),
    { role: 'user', content: question }
  ];

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.6, max_tokens: 1500 })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new AppError(errData.error?.message || `AI error (${response.status})`, response.status);
    }

    const data = await response.json();
    res.json({
      reply: data.choices?.[0]?.message?.content || 'No response',
      sources: chunks.map(c => ({ subject: c.subject, chapter: c.chapter }))
    });
  } catch (err) {
    if (err.isOperational) throw err;
    throw new AppError('AI service unreachable', 502);
  }
}));

router.get('/subjects', asyncHandler(async (req, res) => {
  const subjects = await BookChunk.aggregate([
    { $group: { _id: '$subject', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  res.json({ data: subjects.map(s => ({ subject: s._id, chunks: s.count })) });
}));

router.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));

module.exports = router;