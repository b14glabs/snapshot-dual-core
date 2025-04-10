import path from 'path'
import { promises as fsPromises } from 'fs'
import { readFile } from 'fs/promises'
import beHelperAbi from '../abi/beHelperAbi.json'
import { BE_HELPER_ADDRESS, TYPE } from '../const'
import { web3 } from '../main'
import { writeAddresses } from '../utils/file-handler'
import { logger, persistLog } from '../logger'
import { crawlAddress } from '../utils/crawl-addresses'

type AccountType = 'wallet' | 'contract'

type KnownTypes = Record<
  string,
  {
    type?: 'wallet' | 'contract'
  }
>

interface User {
  id: string,
  dualCoreBalance: string
}
interface SubgraphResponse {
  data: {
    users: User[]
  }
}

export interface Account {
  balance: number
  type: AccountType
}

export type DualCoreSnapshotData = {
  holder: string
  amount: string
  type: TYPE
  time: Date
}

async function saveAddresses(
  data: Record<
    string,
    {
      balance: bigint
    }
  >
) {
  const addresses = Object.keys(data)
    .map((el) => ({
      address: el,
      balance: data[el].balance,
    }))
    // .filter((el) => el.balance != BigInt(0))
    .map((el) => el.address)
  await writeAddresses([...new Set(addresses)])
}

export const dualCoreSnapshot = async (date: Date, block: number): Promise<DualCoreSnapshotData[]> => {
  try {
    persistLog(`Snapshot at block ${block}`);
    const result: User[] = []
    let data: SubgraphResponse;
    let skip = 0;
    do {
      const res = await fetch(process.env.SUBGRAPH_ENDPOINT, {
        method: "POST",
        headers: {
          'accept-language': 'en-US,en;q=0.9',
          'content-type': 'application/json',
          'origin': 'https://thegraph.coredao.org',
        },
        body: JSON.stringify({
          "query": `query MyQuery {\n  users(\n    first: 1000\n    skip: ${skip}\n    block: {number: ${block}}\n    where: {dualCoreBalance_gt: 0}\n  ) {\n    dualCoreBalance\n    id\n  }\n}`,
          "variables": null,
          "extensions": {
            "headers": null
          }
        }),
      })
      if(res.status !== 200) throw `Call to subgraph failed, ${res.status}`
      data = await res.json() as SubgraphResponse;
      result.push(...data.data.users)
      skip += 1000;
    } while (data.data.users.length > 0)
    return result.map(el => ({
      amount: el.dualCoreBalance,
      holder: el.id,
      time: date,
      type: TYPE.DUAL_CORE_SNAPSHOT
    }))
  } catch (error) {
    persistLog(`dualCore snapshot : ${error}`)
    return undefined
  }
}

// export const dualCoreSnapshot = async (date: Date, block: number): Promise<DualCoreSnapshotData[]> => {
//   try {
//     const { addresses, fromBlock } = await crawlAddress()
//     persistLog(`Snapshot from block ${fromBlock}`)
//     const balances = await getBlanceOfBatch(addresses, block)
//     await saveAddresses(balances)

//     const balancesWithType = (await addType(balances)) as Record<
//       string,
//       {
//         balance: bigint
//         type: 'wallet' | 'contract'
//       }
//     >
//     const records = Object.keys(balancesWithType)
//       .map((wallet) => {
//         if (
//           balancesWithType[wallet].balance != BigInt(0)
//         ) {
//           return {
//             holder: wallet.toLowerCase(),
//             amount: balancesWithType[wallet].balance.toString(),
//             type: TYPE.DUAL_CORE_SNAPSHOT,
//             time: date,
//           }
//         }
//       })
//       .filter((record) => record != undefined)
//     return records
//   } catch (error) {
//     logger.info(`dualCore snapshot : ${error}`)
//     return undefined
//   }
// }

const getBlanceOfBatch = async (
  addresses: string[],
  block: number
): Promise<
  Record<
    string,
    {
      balance: bigint
    }
  >
> => {
  const contract = new web3.eth.Contract(beHelperAbi, BE_HELPER_ADDRESS)
  let step = 4000
  const promises = []
  for (let i = 0; i < addresses.length; i += step) {
    const to = Math.min(i + step, addresses.length)
    const balanceBatch = contract.methods
      .balanceOfBatch(addresses.slice(i, to), process.env.DUAL_CORE_ADDRESS)
      .call({}, block)
      .then((balances) => ({ index: i, balances }))
    promises.push(balanceBatch)
  }
  const balanceBatches = await getBalancesBatch(promises)
  const result = {}
  addresses.forEach((address, idx) => {
    result[address] = {
      balance: balanceBatches[idx],
    }
  })
  return result
}

const getBalancesBatch = async (arr: Array<Promise<any>>) => {
  let balanceBatches = await Promise.all(arr)
  balanceBatches.sort((a, b) => a.index - b.index)
  return balanceBatches.map((el) => el.balances).flat()
}

const findTypeFromCache = (
  cache: KnownTypes,
  wallet: string
): 'wallet' | 'contract' | null => {
  if (cache[wallet]) return cache[wallet].type
  return null
}

const addType = async (
  wallets: Record<
    string,
    {
      balance: bigint
      type?: undefined | string
    }
  >,
  checkContract = 'yes'
) => {
  if (checkContract.toLowerCase() !== 'yes') {
    return wallets
  }
  const knownTypesPath = path.join(process.cwd(), 'volumes/known-types.json')
  let counter = 0
  const cache: KnownTypes = (await parseFile(knownTypesPath)) || {}
  for (const wallet in wallets) {
    counter++
    let type = findTypeFromCache(cache, wallet)
    if (!type) {
      type = 'wallet'
      const code = await web3.eth.getCode(wallet)

      if (code !== '0x') {
        type = 'contract'
      }
      // Add new wallet type
      cache[wallet] = {}
      cache[wallet].type = type
    }

    wallets[wallet].type = type
  }

  // Ensure the directory exists
  await fsPromises.mkdir(path.join(process.cwd(), '.cache'), {
    recursive: true,
  })
  await fsPromises.writeFile(knownTypesPath, JSON.stringify(cache, null, 2))
  return wallets
}
export const parseFile = async (filePath: string): Promise<any | null> => {
  try {
    const contents = await readFile(filePath, 'utf8')
    return JSON.parse(contents)
  } catch (error) {
    return null
  }
}
