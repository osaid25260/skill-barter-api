const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const Account = require('../models/Account');
const { writeLimiter } = require('../middleware/security');
const { asyncHandler, AppError } = require('../utils/asyncHandler');

const router = express.Router();

function signToken(account) {
  return jwt.sign(
    { id: account._id.toString(), email: account.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '30d' }
  );
}
function vErr(res, errors) {
  return res.status(400).json({ error: 'Validation failed', details: errors.array().map(e => ({ field: e.path, message: e.msg })) });
}

router.post('/register', writeLimiter, [
  body('email').trim().isEmail().normalizeEmail(),
  body('password').isLength({ min: 6, max: 100 }),
  body('name').optional({ checkFalsy: true }).trim().isLength({ max: 80 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return vErr(res, errors);
  const { email, password, name } = req.body;
  const existing = await Account.findOne({ email });
  if (existing) throw new AppError('Email already registered', 409);
  const account = new Account({ email, name: name || '' });
  await account.setPassword(password);
  await account.save();
  const token = signToken(account);
  res.status(201).json({ token, account });
}));

router.post('/login', writeLimiter, [
  body('email').trim().isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return vErr(res, errors);
  const { email, password } = req.body;
  const account = await Account.findOne({ email });
  if (!account) throw new AppError('Invalid email or password', 401);
  const ok = await account.checkPassword(password);
  if (!ok) throw new AppError('Invalid email or password', 401);
  const token = signToken(account);
  res.json({ token, account });
}));

router.get('/me', asyncHandler(async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw new AppError('No token', 401);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const account = await Account.findById(payload.id);
    if (!account) throw new AppError('Account not found', 404);
    res.json({ account });
  } catch (e) { throw new AppError('Invalid token', 401); }
}));

module.exports = router;