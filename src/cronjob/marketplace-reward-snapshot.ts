import { multicall } from 'viem/actions'
import { createConfig, getClient, http } from '@wagmi/core'
import marketplaceAbi from '../abi/marketplace.json'
import assetOnchainAbi from '../abi/assetOnchain.json'
import { persistLog } from '../logger'
import candidateHubAbi from '../abi/candidateHub.json'
import bitcoinStakeAbi from '../abi/bitcoinStake.json'
import receiverAbi from '../abi/receiver.json'
import dotenv from 'dotenv'
import { Contract, ethers, formatEther, JsonRpcProvider } from 'ethers'
import {
  findAllBtcStaker,
  findAllCoreStaker,
} from '../service/marketplace.service'
import { readFileSync, writeFileSync } from 'fs'
import { defineChain } from 'viem'
import { IPoint } from '../model/point.schema'
import { web3 } from '../main'
import { EventLog } from 'web3'
import {
  checkMarketplaceRewardSnapshotAtDate,
  insertPoint,
} from '../service/point.service'
import { BITCOIN_STAKE_ADDRESS, TYPE } from '../const'

dotenv.config()
async function sleep(ms: number) {
  await new Promise((res) => setTimeout(res, ms))
}
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
    new Set((await findAllCoreStaker()).map((el) => el.toLowerCase())))
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
      today: todayReward[i].toString(),
      yesterday: previousReward[i].toString(),
      reward: (todayReward[i] - previousReward[i]).toString(),
      type: 'rewardForCore',
    })
    if (todayReward[i] < previousReward[i]) {
      console.log({
        address: coreStakers[i],
        today: todayReward[i].toString(),
        yesterday: previousReward[i].toString(),
        reward: (todayReward[i] - previousReward[i]).toString(),
      })
      throw 'Invalid reward'
    }
  }
  return data
}

async function readRewardForBtcStakers(todayBlock: number, yesterdayBlock: number) {
  const btcStakers = await findAllBtcStaker()
  const mapBtcStakerToReceiver: Record<string, Array<{
    receiver: string,
    txHash: string,
      to: string
  }>> = {}
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
    jsonRpc
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
        contracts: mapBtcStakerToReceiver[address].map((el) => ({
          functionName: 'btcTxMap',
          args: [el.txHash],
          address: BITCOIN_STAKE_ADDRESS,
          abi: bitcoinStakeAbi,
        })) as any,
        multicallAddress: multiCallAddress,
        blockNumber: BigInt(yesterdayBlock),
      }) as any
      mapBtcStakerToReceiver[address] = mapBtcStakerToReceiver[address].filter(
        (_, idx) => result[idx].result[0] != BigInt(0)
      )
      const todayReward =
        (await marketplaceContract.claimBTCRewardProxyOnBehalf.staticCall(
          mapBtcStakerToReceiver[address],
          {
            blockTag: todayBlock,
            from: address,
          }
        )).reduce(
          (acc: bigint, cur: bigint) => acc + cur,
          BigInt(0)
        ) as bigint

      const yesterdayReward =
        (await marketplaceContract.claimBTCRewardProxyOnBehalf.staticCall(
          mapBtcStakerToReceiver[address],
          {
            blockTag: yesterdayBlock,
          }
        )).reduce(
          (acc: bigint, cur: bigint) => acc + cur,
          BigInt(0)
        ) as bigint
      data.push({
        address,
        reward: todayReward - yesterdayReward,
        today: todayReward,
        type: 'rewardForBtc',
        yesterday: yesterdayReward,
      })
      await sleep(500)
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
      // ignore point for vault contract
      return record.point > 0 && record.holder.toLowerCase() !== "0xcd6d74b6852fbeeb1187ec0e231ab91e700ec3ba"
    })
    await insertPoint(pointRecords)
  } catch (error) {
    persistLog(`marketplaceRewardSnapshot error : ${error}`)
    if (error.toString().includes("TypeError: Cannot read properties of undefined")) {
      await sleep(60000)
      await marketplaceRewardSnapshot(turnRoundBlock)
    }
  }
}

async function readCoreRewards({
  usersAddress,
  blockNumber,
}: {
  usersAddress: Array<string>
  blockNumber: number
}) {
  const batchSize = Math.min(5, usersAddress.length);
  const userStakedOrderResults = await fetchUserStakedOrders(usersAddress, blockNumber, batchSize);
  const rewards = await fetchMarketplaceRewards(usersAddress, userStakedOrderResults, blockNumber, batchSize);

  if (rewards.length !== usersAddress.length) {
    throw new Error('Length mismatch: rewards.length != usersAddress.length');
  }

  return rewards;
}

async function fetchUserStakedOrders(
  usersAddress: Array<string>,
  blockNumber: number,
  batchSize: number
) {
  let userStakedOrder = [];
  let userStakedOrderResult = [];

  for (let i = 0; i < usersAddress.length; i++) {
    userStakedOrder.push({
      functionName: 'getUserStakedOrder',
      args: [usersAddress[i]],
      address: totalAssetAddress,
      abi: assetOnchainAbi,
    });

    if (userStakedOrder.length >= batchSize || i === usersAddress.length - 1) {
      await sleep(100)
      const result = await multicall(publicClient, {
        contracts: userStakedOrder as any,
        multicallAddress: multiCallAddress,
        blockNumber: BigInt(blockNumber)
      }) as any;

      userStakedOrderResult = userStakedOrderResult.concat(
        result.map((el) => el.result)
      );
      userStakedOrder = [];
    }
  }

  if (userStakedOrderResult.length !== usersAddress.length) {
    throw new Error('Length mismatch: userStakedOrderResult.length != usersAddress.length');
  }

  return userStakedOrderResult;
}

async function fetchMarketplaceRewards(
  usersAddress: Array<string>,
  userStakedOrderResults: any[],
  blockNumber: number,
  batchSize: number
) {
  let getMarketplaceRewardCalls = []
  let rewards = []
  for (let i = 0; i < usersAddress.length; i++) {
    const stakedOrders = userStakedOrderResults[i]
    if (stakedOrders.length) {
      for (let j = 0; j < stakedOrders.length; j++) {
        getMarketplaceRewardCalls.push({
          functionName: 'rewardFor',
          args: [
            '0x0000000000000000000000000000000000000000000000000000000000000001',
            usersAddress[i],
          ],
          abi: receiverAbi,
          address: userStakedOrderResults[i][j],
        })
      }
      // @ts-ignore
      const result = await multicall(publicClient, {
        contracts: getMarketplaceRewardCalls as any,
        multicallAddress: multiCallAddress,
        blockNumber: BigInt(blockNumber),
      })
      rewards[i] = result.reduce(
        (acc, cur) => acc + (cur.result as bigint),
        BigInt(0)
      )
    } else {
      rewards[i] = BigInt(0)
    }
    getMarketplaceRewardCalls = []
  }

  return rewards
}
