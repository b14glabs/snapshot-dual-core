import { TYPE } from '../const'
import snapshotSchema, { ISnapshot } from '../model/snapshot.schema'

export const insertSnapshot = (data: ISnapshot[]) => {
  return snapshotSchema.insertMany(data, {
    ordered: false,
  })
}

export const checkSnapshotAtDate = async (date: Date) => {
  const doc = await snapshotSchema.findOne({
    type: TYPE.DUAL_CORE_SNAPSHOT,
    snapshotDate: date,
  })
  return Boolean(doc)
}
