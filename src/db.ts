import { writeFileSync } from 'fs'
import { insertSnapshot } from './service/snapshot.service'

export const insertPointBatch = async (
  results: Array<{
    holder: string
    point: number
    type: string
    amount: string
    time: Date
  }>,
  currentDate = new Date()
) => {
  if (!results.length) return
  return insertSnapshot(results)
}

const getFailedRecord = (data: Array<any>, error) => {
  if (error?.result?.insertedIds) {
    const insertedFailed = []
    data.forEach((data, idx) => {
      if (error.result.insertedIds[idx.toString()] === undefined) {
        insertedFailed.push(data)
      }
    })
    return insertedFailed
  }
  return []
}
