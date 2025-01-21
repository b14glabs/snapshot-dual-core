import mongoose from 'mongoose'

export interface ISnapshot {
  holder: string
  amount: string
  point: number
  type: string
  rewardBy?: string
  rewardType?: string // dualCore-holder
  snapshotDate: Date
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
    snapshotDate: Date,
  },
  { collection: 'snapshot', timestamps: true }
)

SnapshotSchema.index(
  {
    snapshotDate: 1,
    holder: 1,
  },
  {
    unique: true,
    sparse: true
  }
)

export default mongoose.model<ISnapshot>('snapshot', SnapshotSchema)
