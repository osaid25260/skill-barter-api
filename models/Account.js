const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const accountSchema = new mongoose.Schema(
  {
    email: {
      type: String, required: true, unique: true, lowercase: true, trim: true, index: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email']
    },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true, maxlength: 80, default: '' },
    lastSync: { type: Date, default: null },
    data: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

accountSchema.methods.setPassword = async function (password) {
  this.passwordHash = await bcrypt.hash(password, 10);
};
accountSchema.methods.checkPassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};
accountSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  obj.id = obj._id.toString();
  delete obj._id;
  return obj;
};

module.exports = mongoose.model('Account', accountSchema);