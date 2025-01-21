import { insertPointBatch } from '../db'
import { dualCoreSnapshot } from './dual-core-snapshot'
import { logger } from '../logger'
import fs from 'fs'
import { checkSavedSnapshotToday } from '../service/snapshot.service'
import { calculatePoints } from '../utils'

const snapshotDataName = 'snapshot_data_'
const sleepTime = 60000 * 2

async function snapshot() {
  try {
    const currentDate = new Date()
    const utcHour = currentDate.getUTCHours()
    const utcMinute = currentDate.getUTCMinutes()
    if (utcHour !== 0 || utcMinute < 21) {
      return
    }

    const savedToday = await checkSavedSnapshotToday()
    if (savedToday) {
      logger.warn('dualCore Snapshot already saved')
      return
    }

    logger.info('Snapshot starting...')
    const snapshotResult = await dualCoreSnapshot()
    const snapshotWithPoints = await calculatePoints(snapshotResult)

    await Promise.allSettled([
      fs.writeFileSync(
        `volumes/${snapshotDataName}${currentDate.toISOString().split('T')[0].replace(/-/g, '_')}.json`,
        JSON.stringify(snapshotResult)
      ),
      insertPointBatch(snapshotWithPoints, currentDate),
    ])

    await cleanUpBackupData()
    logger.info('Snapshot finished')
  } catch (error) {
    logger.error('Snapshot error')
    console.log(error)
  } finally {
    setTimeout(() => {
      snapshot()
    }, sleepTime)
  }
}

export function cronjob() {
  logger.info('Cronjob started')
  snapshot()
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
