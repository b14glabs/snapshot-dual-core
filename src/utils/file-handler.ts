import { readFileSync, writeFileSync } from 'fs'
import { logger } from '../logger'
import path from 'path'

const fromBlockPath = path.join(__dirname, `../../volumes/fromBlock`)
const addressesPath = path.join(__dirname, `../../volumes/addresses.json`)

export async function readFromBlock(): Promise<number> {
  try {
    const data = await readFileSync(fromBlockPath, 'utf-8')
    return Number(data)
  } catch (error) {
    return 0
  }
}

export async function writeFromBlock(data: number): Promise<void> {
  try {
    await writeFileSync(fromBlockPath, data.toString())
  } catch (error) {
    logger.error(error.message)
  }
}

export async function readAddresses(): Promise<Array<string>> {
  try {
    const data = await readFileSync(addressesPath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    return []
  }
}

export async function writeAddresses(data: Array<string>): Promise<void> {
  try {
    await writeFileSync(addressesPath, JSON.stringify(data))
  } catch (error) {
    logger.error(error.message)
  }
}
