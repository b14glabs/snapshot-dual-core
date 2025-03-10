import { multicall } from 'viem/actions'
import { createConfig, getClient, http } from '@wagmi/core'
import marketplaceAbi from '../abi/marketplace.json'
import assetOnchainAbi from '../abi/assetOnchain.json'
import { persistLog } from '../logger'
import candidateHubAbi from '../abi/candidateHub.json'
import bitcoinStakeAbi from "../abi/bitcoinStake.json"
import dotenv from 'dotenv'
import { Contract, formatEther, JsonRpcProvider } from 'ethers'
import {
  findAllBtcStaker,
  findAllCoreStaker,
} from '../service/marketplace.service'
import { readFileSync, writeFileSync } from 'fs'
import { defineChain } from 'viem'
import { IPoint } from '../model/point.schema'
import { web3 } from '../main'
import { EventLog } from 'web3'
import { checkMarketplaceRewardSnapshotAtDate, insertPoint } from '../service/point.service'
import { BITCOIN_STAKE_ADDRESS, TYPE } from '../const'

dotenv.config()

const archiveRpc = 'https://rpcar.coredao.org'
export const archiveCoreDao = /*#__PURE__*/ defineChain({
  id: 1116,
  name: 'Core Dao',
  nativeCurrency: {
    decimals: 18,
    name: 'Core',
    symbol: 'CORE',
  },
  rpcUrls: {
    default: { http: [archiveRpc] },
  },
  blockExplorers: {
    default: {
      name: 'CoreDao',
      url: 'https://scan.coredao.org',
    },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 11_907_934,
    },
  },
  testnet: false,
})
export const config = createConfig({
  chains: [archiveCoreDao],
  transports: {
    [archiveCoreDao.id]: http(),
  },
})
const publicClient = getClient(config)
const marketplaceAddress = '0x04EA61C431F7934d51fEd2aCb2c5F942213f8967'
const totalAssetAddress = process.env.TOTAL_ASSET_ONCHAIN_ADDRESS
const multiCallAddress = '0xcA11bde05977b3631167028862bE2a173976CA11'
const jsonRpc = new JsonRpcProvider(archiveRpc)

const turnRoundFromBlockPath = 'volumes/turnRoundFromBlock'

export async function listenTurnRoundEvents() {
  try {
    const contract = new web3.eth.Contract(
      candidateHubAbi,
      '0x0000000000000000000000000000000000001005'
    )
    const latestBlock = await web3.eth.getBlockNumber()
    let fromBlock = 0

    try {
      fromBlock = Number(readFileSync(turnRoundFromBlockPath, 'utf-8'))
    } catch (error) {
      persistLog(`Error reading file: ${error}`)
    }

    fromBlock = Math.min(fromBlock, Number(latestBlock))
    const toBlock = Math.min(fromBlock + 9999, Number(latestBlock))
    console.log(`Get event from ${fromBlock} to ${toBlock}`)

    const turnRoundEvent = (await contract.getPastEvents('turnedRound' as any, {
      fromBlock: fromBlock,
      toBlock: toBlock,
    })) as EventLog[]

    for (const event of turnRoundEvent.slice(-1)) {
      await marketplaceRewardSnapshot(Number(event.blockNumber))
    }

    writeFileSync(turnRoundFromBlockPath, toBlock.toString())
  } catch (error) {
    persistLog(`listenEvents error: ${error}`)
  } finally {
    setTimeout(() => {
      listenTurnRoundEvents()
    }, 5 * 60000)
  }
}

async function readRewardForCoreStakers(todayBlock: number, yesterdayBlock: number) {
  const coreStakers = Array.from(
    new Set((await findAllCoreStaker()).map((el) => el.toLowerCase()))
  )
  const todayReward = await readCoreRewards({
    blockNumber: todayBlock,
    usersAddress: coreStakers,
  })
  const previousReward = await readCoreRewards({
    blockNumber: yesterdayBlock,
    usersAddress: coreStakers,
  })
  const data: Array<{
    yesterday: string
    today: string
    address: string
    reward: string
    type: 'rewardForCore'
  }> = []

  for (let i = 0; i < todayReward.length; i++) {
    data.push({
      address: coreStakers[i],
      today: todayReward[i].reward.toString(),
      yesterday: previousReward[i].reward.toString(),
      reward: (todayReward[i].reward - previousReward[i].reward).toString(),
      type: 'rewardForCore',
    })
    if (todayReward[i] < previousReward[i]) {
      console.log({
        address: coreStakers[i],
        today: todayReward[i].reward.toString(),
        yesterday: previousReward[i].reward.toString(),
        reward: (todayReward[i].reward - previousReward[i].reward).toString(),
      })
      throw 'Invalid reward'
    }
  }
  return data
}

async function readRewardForBtcStakers(todayBlock: number, yesterdayBlock: number) {
  const btcStakers = await findAllBtcStaker()
  const mapBtcStakerToReceiver = {}
  btcStakers.forEach((item) => {
    const data = {
      receiver: item.rewardReceiver,
      txHash: item.txHash,
      to: item.from,
    }
    if (mapBtcStakerToReceiver[item.from.toLowerCase()]) {
      mapBtcStakerToReceiver[item.from.toLowerCase()].push(data)
    } else {
      mapBtcStakerToReceiver[item.from.toLowerCase()] = [data]
    }
  })
  const marketplaceContract = new Contract(
    marketplaceAddress,
    marketplaceAbi,
    new JsonRpcProvider('https://rpcar.coredao.org')
  )
    const data: Array<{
    address: string
    reward: bigint
    today: bigint
    yesterday: bigint
    type: 'rewardForBtc'
  }> = []
  for (const address of Object.keys(mapBtcStakerToReceiver)) {
    try {
      // Remove invalid txHash
      // @ts-ignore
      const result = await multicall(publicClient, {
        // @ts-ignore
        contracts: mapBtcStakerToReceiver[address].map((el) => ({
          functionName: 'btcTxMap',
          args: [el.txHash],
          address: BITCOIN_STAKE_ADDRESS,
          abi: bitcoinStakeAbi,
        })),
        multicallAddress: multiCallAddress,
        blockNumber: BigInt(yesterdayBlock),
      })
      mapBtcStakerToReceiver[address] = mapBtcStakerToReceiver[address].filter(
        (_, idx) => result[idx].result[0] != BigInt(0)
      )
      const todayRewards =
        await marketplaceContract.claimBTCRewardProxyOnBehalf.staticCall(
          mapBtcStakerToReceiver[address],
          {
            blockTag: todayBlock,
          }
        )
      const yesterdayRewards =
        await marketplaceContract.claimBTCRewardProxyOnBehalf.staticCall(
          mapBtcStakerToReceiver[address],
          {
            blockTag: yesterdayBlock,
          }
        )
      const todayReward = todayRewards.reduce(
        (acc, cur) => acc + cur,
        BigInt(0)
      ) as bigint
      const yesterdayReward = yesterdayRewards.reduce(
        (acc, cur) => acc + cur,
        BigInt(0)
      ) as bigint
      data.push({
        address,
        reward: todayReward - yesterdayReward,
        today: todayReward,
        type: 'rewardForBtc',
        yesterday: yesterdayReward,
      })
      await new Promise((res) => setTimeout(res, 500))
    } catch (error) {
      console.error(`error `, address, error.shortMessage || error.message)
    }
  }
  return data
}

async function marketplaceRewardSnapshot(turnRoundBlock: number) {
  try {
    const todayBlockData = await jsonRpc.getBlock(turnRoundBlock)
    const yesterdayBlock = turnRoundBlock - 1
    const date = new Date(todayBlockData.timestamp * 1000)
    const saved = await checkMarketplaceRewardSnapshotAtDate(date)
    if (saved) {
      persistLog(`marketplace reward snapshot already saved at date  date.toUTCString()`)
      return
    }
    persistLog(
      `Start at today block: ${turnRoundBlock}, yesterday block: ${yesterdayBlock}`
    )

    const rewardForCoreStaker = await readRewardForCoreStakers(turnRoundBlock, yesterdayBlock)
    persistLog('rewardForCoreStaker done.')
    const rewardForBtcStakers = await readRewardForBtcStakers(turnRoundBlock, yesterdayBlock)
    persistLog('rewardForBtcStakers done.')
    let totalReward = BigInt(0)
    let pointRecords: Array<IPoint> = [
      ...rewardForCoreStaker,
      ...rewardForBtcStakers,
    ].map((staker) => {
      totalReward += BigInt(staker.reward)
      return {
        type: TYPE.MARKETPLACE_CLAIM_REWARD,
        isBtcClaim: staker.type === 'rewardForBtc',
        amount: staker.reward.toString(),
        coreReward: staker.reward.toString(),
        holder: staker.address,
        time: new Date(todayBlockData.timestamp * 1000),
        point: +Number(formatEther(staker.reward)).toFixed(6),
      }
    })
    persistLog(`Total reward : ${formatEther(totalReward)}`)
    await writeFileSync(
      `volumes/marketplaceReward_${new Date(todayBlockData.timestamp * 1000).toISOString().split('T')[0].replace(/-/g, '_')}.json`,
      JSON.stringify(pointRecords)
    )
    pointRecords = pointRecords.filter(record => {
      record.createdAt = record.time;
      return record.point > 0 && record.holder.toLowerCase() !== "0xcd6d74b6852fbeeb1187ec0e231ab91e700ec3ba"
    })
    await insertPoint(pointRecords)
  } catch (error) {
    persistLog(`marketplaceRewardSnapshot error : ${error}`)
  }
}

async function readCoreRewards({
  usersAddress,
  blockNumber,
}: {
  usersAddress: Array<string>
  blockNumber: number
}) {
  const step = Math.min(5, usersAddress.length)
  let userStakedOrder = []
  let userStakedOrderResult = []

  for (let i = 0; i < usersAddress.length; i++) {
    userStakedOrder.push({
      functionName: 'getUserStakedOrder',
      args: [usersAddress[i]],
      address: totalAssetAddress,
      abi: assetOnchainAbi,
    })
    //   Todo: 
    if (userStakedOrder.length >= step || usersAddress.length - i < step) {
      // @ts-ignore
      const result = await multicall(publicClient, {
        contracts: userStakedOrder as any,
        multicallAddress: multiCallAddress,
        //   allowFailure: true,
        blockNumber: BigInt(blockNumber),
        batchSize: 4096,
      })
      userStakedOrderResult = userStakedOrderResult.concat(
        result.map((el) => {
          return el.result
        })
      )
      userStakedOrder = []
    }
  }
  let getMarketplaceRewardCalls = []
  let rewards = []
  if (userStakedOrderResult.length != usersAddress.length) {
    throw 'Leng mis match userStakedOrderResult.length != usersAddress.length'
  }
  let chunkSize = []
  for (let i = 0; i < usersAddress.length; i++) {
    if (userStakedOrderResult[i].length) {
      chunkSize.push(userStakedOrderResult[i].length)
      for (let j = 0; j < userStakedOrderResult[i].length; j = j + 5) {
        getMarketplaceRewardCalls.push({
          functionName: 'getMarketplaceReward',
          args: [usersAddress[i], userStakedOrderResult[i].slice(j, j + 5)],
          address: totalAssetAddress,
          abi: assetOnchainAbi,
        })
      }
    } else {
      chunkSize.push(1)
      getMarketplaceRewardCalls.push({
        functionName: 'getMarketplaceReward',
        args: [usersAddress[i], userStakedOrderResult[i]],
        address: totalAssetAddress,
        abi: assetOnchainAbi,
      })
    }
    if (
      getMarketplaceRewardCalls.length >= step ||
      usersAddress.length - i < step
    ) {
    // @ts-ignore
    let result = await multicall(publicClient, {
        contracts: getMarketplaceRewardCalls as any,
      multicallAddress: multiCallAddress,
      // allowFailure: true,
      blockNumber: BigInt(blockNumber),
      batchSize: 4096,
      })
      let pointer = 0;
      const reward = chunkSize.map(size => {
        const res = result.slice(pointer, size)
        pointer += size;
        return res.reduce((acc, cur) => acc + (cur.result as bigint), BigInt(0))
      })
    rewards = rewards.concat(
      reward.map((el, idx) => {
          return {
            reward: el || BigInt(0),
            userStakedData: getMarketplaceRewardCalls[idx].args[1],
          }
        })
      )
      getMarketplaceRewardCalls = []
      chunkSize = []
    }
  }
  if (rewards.length != usersAddress.length) {
    throw 'Leng mis match rewards.length != usersAddress.length'
  }
  return rewards
}
