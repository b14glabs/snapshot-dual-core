import { insertPointBatch } from '../db'
import { dualCoreSnapshot } from './dual-core-snapshot'
import { logger } from '../logger'
import fs from 'fs'
import { checkSnapshotAtDate } from '../service/snapshot.service'
import { calculatePoints } from '../utils'

const snapshotDataName = 'snapshot_data_'

export async function snapshot(date: Date, block: number) {
  const saved = await checkSnapshotAtDate(date)
  if (saved) {
    logger.warn('dualCore Snapshot already saved at date', date.toUTCString())
    return
  }

  logger.info(`Snapshot starting... at +  ${date.toUTCString()}`)
  const snapshotResult = await dualCoreSnapshot(date, block - 1)
  const snapshotWithPoints = await calculatePoints(snapshotResult)

  await Promise.allSettled([
    fs.writeFileSync(
      `volumes/${snapshotDataName}${date.toISOString().split('T')[0].replace(/-/g, '_')}.json`,
      JSON.stringify(snapshotResult)
    ),
    insertPointBatch(snapshotWithPoints, date),
  ])

  await cleanUpBackupData()
  logger.info('Snapshot finished')
}

async function cleanUpBackupData() {
  try {
    const THIRTY_DAYS = 86400 * 30 * 1000
    const today = new Date()
    // Read all files from the directory
    const files = fs.readdirSync('volumes')
    files.forEach((file) => {
      const match = file.match(/snapshot_data_(\d{4})_(\d{2})_(\d{2})\.json/)
      if (match) {
        const [, year, month, day] = match
        const fileDate = new Date(`${year}-${month}-${day}`)

        if (Number(today) - Number(fileDate) > THIRTY_DAYS) {
          fs.unlinkSync(`volumes/${file}`)
        }
      }
    })
  } catch (error) {
    console.error(error)
  }
}
