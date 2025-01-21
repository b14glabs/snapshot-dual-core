import path from 'path'
import dualCoreAbi from '../abi/dualCore.json'
import { promises as fsPromises } from 'fs'
import fs from 'fs'
import { promisify } from 'util'
import { web3 } from '../main'
import {
  readAddresses,
  readFromBlock,
  writeAddresses,
  writeFromBlock,
} from './file-handler'
import { logger } from '../logger'

const readdirAsync = promisify(fs.readdir)
const readFileAsync = promisify(fs.readFile)

const blocksPerBatch = 2500

export async function crawlAddress() {
  try {
    const toBlock = Number(await web3.eth.getBlockNumber())
    const fromBlock = await readFromBlock()
    if (fromBlock === 0) {
      logger.warn('========= FromBlock is 0 =========')
    }

    let start = fromBlock
    let end = Math.min(fromBlock + blocksPerBatch, toBlock)
    do {
      await tryGetEvents(start, end, 'dualCore')
      start = end + 1
      end = start + blocksPerBatch
      if (end > toBlock) {
        end = toBlock
      }
    } while (end < toBlock)

    const { addresses } = await getEvents('dualCore')
    const oldAddresses = await readAddresses()
    const newAddresses = [...new Set(addresses.concat(oldAddresses))]

    await writeAddresses(newAddresses)
    writeFromBlock(toBlock - 1)
    deleteTxFolder(path.join(process.cwd(), `./tx/dualCore`))
    return {
      addresses: newAddresses,
      fromBlock,
    }
  } catch (error) {
    logger.error(error)
  }
}

async function deleteTxFolder(folderPath) {
  try {
    await fs.rmSync(folderPath, { recursive: true, force: true })
  } catch (err) {
    console.error(`Error while deleting ${folderPath}.`, err)
  }
}

const groupBy = (objectArray: any[], property: string) => {
  return objectArray.reduce((acc, obj) => {
    const key = obj[property]
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(obj)
    return acc
  }, {})
}

const tryGetEvents = async (start: number, end: number, symbol: string) => {
  const contract = new web3.eth.Contract(dualCoreAbi, process.env.DUAL_CORE_ADDRESS)
  try {
    const pastEvents = await contract.getPastEvents('Transfer' as any, {
      fromBlock: start,
      toBlock: end,
    })
    const group = groupBy(pastEvents, 'blockNumber')
    const promises = []
    await fsPromises.mkdir(path.join(process.cwd(), `./tx/${symbol}/`), {
      recursive: true,
    })
    for (let key in group) {
      const blockNumber = key
      const data = group[key]
      const file = path.join(
        process.cwd(),
        `./tx/${symbol}/${blockNumber}.json`
      )
      const promise = fsPromises.writeFile(file, JSON.stringify(data))
      promises.push(promise)
    }

    await Promise.all(promises)
  } catch (e) {
    console.error(e)
  }
}

const getMinimal = (pastEvents, addresses: Set<string>) => {
  return pastEvents.map((tx) => {
    if (tx.returnValues['0'] !== '0x0000000000000000000000000000000000000000') {
      addresses.add(tx.returnValues['0'])
    }
    if (tx.returnValues['1'] !== '0x0000000000000000000000000000000000000000') {
      addresses.add(tx.returnValues['1'])
    }
    return {
      transactionHash: tx.transactionHash,
      from: tx.returnValues['0'],
      to: tx.returnValues['1'],
      value: BigInt(tx.returnValues['2']),
    }
  })
}

const getEvents = async (symbol: string) => {
  try {
    const directory = path.join(process.cwd(), `./tx/${symbol}/`)
    var files = await readdirAsync(directory)
    files.sort((a, b) => {
      return parseInt(a.split('.')[0]) - parseInt(b.split('.')[0])
    })
    let events = []

    const addresses = new Set<string>()
    for await (const file of files) {
      const contents = await readFileAsync(path.join(directory, file))
      const parsed = JSON.parse(contents.toString())
      events = events.concat(getMinimal(parsed, addresses))
    }

    return { events, addresses: Array.from(addresses) }
  } catch (error) {
    return {
      events: [],
      addresses: [],
    }
  }
}
