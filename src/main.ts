import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Web3 from 'web3'
import express, { Router, Request, Response } from "express"
import morgan from 'morgan'
import { listenEvents } from './cronjob/crawl-claim-event'
import { dualCoreSnapshot } from './cronjob/dual-core-snapshot'

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

const router: Router = Router()

router.get("/snapshot", async function (req: Request, res: Response) {
  try {
    const block = await web3.eth.getBlockNumber()
    const data = await dualCoreSnapshot(new Date(), Number(block))
    res.status(200).json({ data })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error })
  }
})

app.use("/", router)

mongoose.connect(process.env.MONGO_URL as string, {
  dbName: DB_NAME,
}).then(() => {
  listenEvents()
  app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`)
  })
})
