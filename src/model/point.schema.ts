import mongoose from 'mongoose'

export interface IPoint {
  holder: string
  amount: string
  point: number
  type: string
  rewardBy?: string
  rewardType?: string // dualCore-holder
  time: Date
}

const SnapshotSchema = new mongoose.Schema<IPoint>(
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
  { collection: 'point', timestamps: true }
)
export default mongoose.model<IPoint>('point', SnapshotSchema)
