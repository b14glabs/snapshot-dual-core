import { MUTIPIER_POINT_DUAL_CORE } from '../const'
import { DualCoreSnapshotData } from '../cronjob/dual-core-snapshot'

export function formatDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const getDiffExchangeRate = async () => {
  const pastExchangeRateRes = await fetch(
    'https://api.b14g.xyz/restake/vault/apy-chart'
  )

  if (pastExchangeRateRes.status !== 200) throw 'Cannot get past exchangeRate'
  const pastExchangeRate = await pastExchangeRateRes.json()

  const yesterday = new Date()
  yesterday.setDate(yesterday.getUTCDate() - 1)
  const current = new Date()
  const yesterdayDate = formatDateString(yesterday)
  const currentDate = formatDateString(current)

  let yesterdayExchangeRate, currentExchangeRate
  pastExchangeRate.data.forEach((item) => {
    if (item._id === yesterdayDate) {
      yesterdayExchangeRate = item.rate
    }
    if (item._id === currentDate) {
      currentExchangeRate = item.rate
    }
  })

  if (!yesterdayExchangeRate || !currentExchangeRate)
    throw 'Exchange rate is not found'
  return currentExchangeRate - yesterdayExchangeRate
}

export const calculatePoints = async (data: DualCoreSnapshotData[]) => {
  const diffExchangeRate = await getDiffExchangeRate()
  return data.map((item) => {
    return {
      ...item,
      point:
        ((Number(item.amount) * diffExchangeRate) / 1e36) *
        MUTIPIER_POINT_DUAL_CORE,
    }
  })
}
