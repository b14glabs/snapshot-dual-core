import coreVaultAbi from '../abi/coreVault.json'
import { EventLog } from 'web3'
import fs from 'fs'
import { log } from 'console'
import { web3 } from '../main'
import { snapshot } from '.'
import { persistLog } from '../logger'

const coreVaultFromBlockPath = 'volumes/coreVaultFromBlock'

export async function listenEvents() {
  try {
    const contract = new web3.eth.Contract(
      coreVaultAbi,
      process.env.CORE_VAULT_ADDRESS
    )
    const latestBlock = await web3.eth.getBlockNumber()
    let fromBlock = 0

    try {
      fromBlock = Number(fs.readFileSync(coreVaultFromBlockPath, 'utf-8'))
    } catch (error) {
      log(`Error reading file: ${error}`)
    }

    fromBlock = Math.min(fromBlock, Number(latestBlock))
    const toBlock = Math.min(fromBlock + 9999, Number(latestBlock))
    log(`Get event from ${fromBlock} to ${toBlock}`)

    const claimRewardEvent = (await contract.getPastEvents(
      'ClaimReward' as any,
      {
        fromBlock: fromBlock,
        toBlock: toBlock,
      }
    )) as EventLog[]

    for (const event of claimRewardEvent) {
      const blockInfo = await web3.eth.getBlock(event.blockNumber)
      if (event.returnValues.reward !== BigInt(0)) {
        await snapshot(
          new Date(Number(blockInfo.timestamp) * 1000),
          Number(event.blockNumber)
        )
      }
    }

    fs.writeFileSync(coreVaultFromBlockPath, toBlock.toString())
  } catch (error) {
    persistLog(`listenEvents error: ${error}`)
  } finally {
    setTimeout(() => {
      listenEvents()
    }, 60000 * 3)
  }
}
