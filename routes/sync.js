const express = require('express');
const jwt = require('jsonwebtoken');
const Account = require('../models/Account');
const { writeLimiter } = require('../middleware/security');
const { asyncHandler, AppError } = require('../utils/asyncHandler');

const router = express.Router();

async function authRequired(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) throw new AppError('No token', 401);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const account = await Account.findById(payload.id);
    if (!account) throw new AppError('Account not found', 404);
    req.account = account;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

router.get('/', authRequired, asyncHandler(async (req, res) => {
  res.json({ data: req.account.data || {}, lastSync: req.account.lastSync });
}));

router.post('/', writeLimiter, authRequired, asyncHandler(async (req, res) => {
  const data = req.body?.data;
  if (!data || typeof data !== 'object') throw new AppError('Invalid data', 400);
  const size = JSON.stringify(data).length;
  if (size > 100000) throw new AppError('Data too large (max 100KB)', 413);
  req.account.data = data;
  req.account.lastSync = new Date();
  await req.account.save();
  res.json({ ok: true, lastSync: req.account.lastSync });
}));

module.exports = router;