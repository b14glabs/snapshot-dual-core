import mongoose from 'mongoose'

export interface IPoint {
  holder: string
  amount: string
  point: number
  type: string
  rewardBy?: string
  rewardType?: string // dualCore-holder
  time: Date
  coreReward?: string,
  createdAt?: Date
}

const SnapshotSchema = new mongoose.Schema<IPoint>(
  {
    holder: {
      type: String,
    },
    point: Number,
    amount: String,
    type: String,
    time: Date,
    coreReward: String
  },
  { collection: 'point', timestamps: true }
)
export default mongoose.model<IPoint>('point', SnapshotSchema)
