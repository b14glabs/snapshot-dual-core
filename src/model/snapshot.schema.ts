import mongoose from 'mongoose'

export interface ISnapshot {
  holder: string
  amount: string
  point: number
  type: string
  rewardBy?: string
  rewardType?: string // dualCore-holder
  time: Date
}

const SnapshotSchema = new mongoose.Schema<ISnapshot>(
  {
    holder: {
      type: String,
    },
    rewardBy: String,
    rewardType: String,
    point: Number,
    amount: String,
    type: String,
    time: Date,
  },
  { collection: 'snapshot', timestamps: true }
)

SnapshotSchema.index(
  {
    time: 1,
    holder: 1,
    type: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      time: { $type: 'date' },
      type: { $eq: 'dual-core-snapshot' },
    },
  }
)

export default mongoose.model<ISnapshot>('snapshot', SnapshotSchema)
