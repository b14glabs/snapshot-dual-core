import mongoose, { InferRawDocType } from 'mongoose'

const schemaDefinition = {
  delegator: {
    type: String,
    required: true,
  },
  validator: {
    type: String,
    required: true,
  },
  amount: {
    type: String,
    required: true,
  },
  receiver: {
    type: String,
    required: true,
  },
  transactionHash: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Number,
  },
}

const schema = new mongoose.Schema(schemaDefinition, {
  timestamps: { createdAt: true, updatedAt: true },
  collection: 'MarketplaceStakeEvents',
})

export const MarketplaceStakeEvents = mongoose.connection
  .useDb('marketplace')
  .model('MarketplaceStakeEvents', schema)

export type IMarketplaceStakeEvent = InferRawDocType<typeof schemaDefinition>
