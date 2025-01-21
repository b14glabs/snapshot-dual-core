import { TYPE } from '../const'
import snapshotSchema, { ISnapshot } from '../model/snapshot.schema'

export const insertSnapshot = (data: ISnapshot[]) => {
  return snapshotSchema.insertMany(data, {
    ordered: false,
  })
}

export const checkSavedSnapshotToday = async () => {
  const current = new Date()
  current.setHours(0, 0, 0, 0)
  const doc = await snapshotSchema.findOne({
    type: TYPE.DUAL_CORE_SNAPSHOT,
    createdAt: {
      $gte: current,
    },
  })
  return Boolean(doc)
}
