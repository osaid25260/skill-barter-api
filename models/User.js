const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name:   { type: String, required: [true, 'Name zaroori hai'], trim: true, minlength: [2, 'Name kam az kam 2 characters'], maxlength: [80, 'Name zyada lamba'] },
    email:  { type: String, trim: true, lowercase: true, maxlength: [120, 'Email zyada lamba'], match: [/^\S+@\S+\.\S+$/, 'Email valid nahi hai'] },
    city:   { type: String, trim: true, maxlength: [80, 'City name zyada lamba'] },
    offers: { type: String, required: [true, 'Offering skill zaroori hai'], trim: true, minlength: [2, 'Skill name kam az kam 2 characters'], maxlength: [120, 'Skill name zyada lamba'] },
    wants:  { type: String, required: [true, 'Wanted skill zaroori hai'], trim: true, minlength: [2, 'Skill name kam az kam 2 characters'], maxlength: [120, 'Skill name zyada lamba'] },
    bio:    { type: String, trim: true, maxlength: [400, 'Bio 400 characters se zyada nahi'] }
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

userSchema.index({ name: 'text', offers: 'text', wants: 'text' });
userSchema.index({ city: 1 });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', userSchema);
