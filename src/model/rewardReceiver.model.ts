import mongoose, { InferRawDocType } from 'mongoose'

const schemaDefinition = {
  from: {
    type: String,
    required: true,
  },
  rewardReceiver: {
    type: String,
    required: true,
    unique: true,
  },
  time: {
    type: Number,
    required: true,
  },
  portion: {
    type: Number,
    required: true,
  },
  txHash: {
    type: String,
  },
  amount: {
    type: Number,
  },
  unlockTime: {
    type: Number,
  },
  pendingBtcLockHash: {
    type: String,
  },
  validator: {
    type: String,
  },
  isRedeemed: {
    type: Boolean,
  },
  version: {
    type: String,
    default: 'v2',
  },
  fee: {
    type: Number,
    default: 0,
  },
}

const schema = new mongoose.Schema(schemaDefinition, {
  timestamps: { createdAt: true, updatedAt: true },
  collection: 'RewardReceivers',
})

export const RewardReceivers = mongoose.connection
  .useDb('marketplace')
  .model('RewardReceivers', schema)

export type IRewardReceiver = InferRawDocType<typeof schemaDefinition>
