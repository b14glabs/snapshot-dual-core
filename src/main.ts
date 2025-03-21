import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Web3 from 'web3'
import express, { Router, Request, Response } from "express"
import morgan from 'morgan'
import { listenEvents } from './cronjob/crawl-claim-event'
import { listenTurnRoundEvents } from './cronjob/marketplace-reward-snapshot'

dotenv.config()

const DB_NAME = 'user'
const app = express()
app.use(morgan(':method :url :status - :response-time ms'))

const port = 3001
export const web3 = new Web3(process.env.RPC_URL)

declare global {
  interface BigInt {
    toJSON(): Number
  }
}

BigInt.prototype.toJSON = function () {
  return this.toString()
}

mongoose.connect(process.env.MONGO_URL as string, {
  dbName: DB_NAME,
}).then(() => {
  listenEvents()
  listenTurnRoundEvents()
})
