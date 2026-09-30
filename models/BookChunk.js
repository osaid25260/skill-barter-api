const mongoose = require('mongoose');

const bookChunkSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, index: true },
    chapter: { type: String, default: '', index: true },
    page: { type: Number, default: 0 },
    text: { type: String, required: true },
    chunkIndex: { type: Number, default: 0 }
  },
  { timestamps: true }
);

bookChunkSchema.index({ text: 'text' });
bookChunkSchema.index({ subject: 1, chapter: 1, chunkIndex: 1 });

module.exports = mongoose.model('BookChunk', bookChunkSchema);