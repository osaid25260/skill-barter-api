const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema(
  {
    fromId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: [true, 'Sender ID zaroori hai'], index: true },
    toId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: [true, 'Receiver ID zaroori hai'], index: true },
    message:{ type: String, required: [true, 'Message zaroori hai'], trim: true, minlength: [3, 'Message bohot chhota'], maxlength: [800, 'Message 800 characters se zyada nahi'] },
    status: { type: String, enum: { values: ['pending', 'accepted', 'declined'], message: 'Status sirf pending/accepted/declined' }, default: 'pending' }
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

requestSchema.index({ fromId: 1, toId: 1, status: 1 });
requestSchema.index({ toId: 1, createdAt: -1 });
requestSchema.index({ fromId: 1, createdAt: -1 });

module.exports = mongoose.model('Request', requestSchema);
