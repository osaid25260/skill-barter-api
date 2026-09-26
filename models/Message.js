const mongoose = require('mongoose');

/**
 * Message — chat message within a swap request thread.
 * Each swap (request) has its own message thread.
 */
const messageSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Request',
      required: true,
      index: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      required: [true, 'Message text required'],
      trim: true,
      maxlength: [1000, 'Message 1000 chars max']
    },
    readAt: { type: Date, default: null }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

messageSchema.index({ requestId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);