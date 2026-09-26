const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const User = require('../models/User');
const Request = require('../models/Request');
const Message = require('../models/Message');
const { writeLimiter } = require('../middleware/security');
const { asyncHandler, AppError } = require('../utils/asyncHandler');

const router = express.Router();

function validationErrorResponse(res, errors) {
  return res.status(400).json({
    error: 'Validation failed',
    details: errors.array().map(e => ({ field: e.path, message: e.msg }))
  });
}

// GET /api/users
router.get('/users', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('q').optional().trim().isLength({ max: 100 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationErrorResponse(res, errors);

  const page = req.query.page || 1;
  const limit = req.query.limit || 50;
  const skip = (page - 1) * limit;
  const filter = req.query.q ? { $text: { $search: req.query.q } } : {};

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter)
  ]);

  res.json({ data: users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}));

// GET /api/users/:id
router.get('/users/:id', [param('id').isMongoId().withMessage('Invalid user ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors);
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);
    res.json(user);
  })
);

// POST /api/users
router.post('/users', writeLimiter, [
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name 2-80 chars'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Valid email daalein').normalizeEmail(),
  body('city').optional({ checkFalsy: true }).trim().isLength({ max: 80 }),
  body('offers').trim().isLength({ min: 2, max: 120 }).withMessage('Offering skill zaroori hai'),
  body('wants').trim().isLength({ min: 2, max: 120 }).withMessage('Wanted skill zaroori hai'),
  body('bio').optional({ checkFalsy: true }).trim().isLength({ max: 400 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationErrorResponse(res, errors);

  const { name, email, city, offers, wants, bio } = req.body;
  if (offers.toLowerCase() === wants.toLowerCase()) {
    throw new AppError('Offering aur wanted skill same nahi ho sakti', 400);
  }
  const user = await User.create({ name, email, city, offers, wants, bio });
  res.status(201).json(user);
}));

// POST /api/requests
router.post('/requests', writeLimiter, [
  body('fromId').isMongoId().withMessage('Invalid sender ID'),
  body('toId').isMongoId().withMessage('Invalid receiver ID'),
  body('message').trim().isLength({ min: 3, max: 800 }).withMessage('Message 3-800 chars')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationErrorResponse(res, errors);

  const { fromId, toId, message } = req.body;
  if (fromId === toId) throw new AppError('Apne aap ko request nahi bhej sakte', 400);

  const [sender, receiver] = await Promise.all([
    User.findById(fromId).select('_id'),
    User.findById(toId).select('_id')
  ]);
  if (!sender) throw new AppError('Sender not found', 404);
  if (!receiver) throw new AppError('Receiver not found', 404);

  const existing = await Request.findOne({ fromId, toId, status: 'pending' });
  if (existing) throw new AppError('Request already pending', 409);

  const request = await Request.create({ fromId, toId, message });
  res.status(201).json(request);
}));

// GET /api/requests/:userId
router.get('/requests/:userId', [param('userId').isMongoId().withMessage('Invalid user ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors);
    const { userId } = req.params;
    const [received, sent] = await Promise.all([
      Request.find({ toId: userId }).populate('fromId', 'name offers wants city').sort({ createdAt: -1 }).limit(100),
      Request.find({ fromId: userId }).populate('toId', 'name offers wants city').sort({ createdAt: -1 }).limit(100)
    ]);
    res.json({ received, sent });
  })
);

// PATCH /api/requests/:id
router.patch('/requests/:id', writeLimiter, [
  param('id').isMongoId().withMessage('Invalid request ID'),
  body('status').isIn(['accepted', 'declined']).withMessage('Status sirf accepted ya declined')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationErrorResponse(res, errors);
  const request = await Request.findById(req.params.id);
  if (!request) throw new AppError('Request not found', 404);
  if (request.status !== 'pending') throw new AppError(`Request already ${request.status}`, 409);
  request.status = req.body.status;
  await request.save();
  res.json(request);
}));
// =====================================================
// GET /api/messages/:requestId — fetch chat thread
// =====================================================
router.get(
  '/messages/:requestId',
  [param('requestId').isMongoId().withMessage('Invalid request ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors);

    const messages = await Message.find({ requestId: req.params.requestId })
      .populate('senderId', 'name')
      .sort({ createdAt: 1 })
      .limit(500);

    res.json({ data: messages });
  })
);

// =====================================================
// POST /api/messages — send a message
// =====================================================
router.post(
  '/messages',
  writeLimiter,
  [
    body('requestId').isMongoId().withMessage('Invalid request ID'),
    body('senderId').isMongoId().withMessage('Invalid sender ID'),
    body('text').trim().isLength({ min: 1, max: 1000 }).withMessage('Message 1-1000 chars')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors);

    const { requestId, senderId, text } = req.body;

    const request = await Request.findById(requestId);
    if (!request) throw new AppError('Request not found', 404);

    const fromIdStr = request.fromId.toString();
    const toIdStr = request.toId.toString();
    if (senderId !== fromIdStr && senderId !== toIdStr) {
      throw new AppError('Not a participant in this swap', 403);
    }
    if (request.status !== 'accepted') {
      throw new AppError('Swap not accepted yet', 400);
    }

    const message = await Message.create({ requestId, senderId, text });
    await message.populate('senderId', 'name');
    res.status(201).json(message);
  })
);

// 404 for /api/*
router.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
});

module.exports = router;
