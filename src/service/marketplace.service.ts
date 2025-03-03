import { MarketplaceStakeEvents } from '../model/marketplaceStakeEvents.schema'
import { RewardReceivers } from '../model/rewardReceiver.model'

export const findAllCoreStaker = async () => {
  const coreStaker = await MarketplaceStakeEvents.distinct('delegator')
  return [
    ...coreStaker,
    '0xee21ab613d30330823D35Cf91A84cE964808B83F',
    '0xcd6D74b6852FbeEb1187ec0E231aB91E700eC3BA',
  ]
}

export const findAllBtcStaker = async () => {
  return RewardReceivers.find({
    txHash: { $exists: true },
    isRedeemed: {
        $exists: false
    }
  })
}
