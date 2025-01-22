import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { cronjob } from './cronjob'
import Web3 from 'web3'

dotenv.config()

const DB_NAME = 'btc_restaking'

mongoose.connect(process.env.MONGO_URL as string, {
  dbName: DB_NAME,
})

export const web3 = new Web3(process.env.RPC_URL)

declare global {
  interface BigInt {
    toJSON(): Number
  }
}

BigInt.prototype.toJSON = function () {
  return this.toString()
}

cronjob()
