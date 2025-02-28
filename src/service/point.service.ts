import { TYPE } from '../const'
import snapshotSchema, { IPoint } from '../model/point.schema'
import axios from "axios";
import * as crypto from "crypto";
import * as secp256k1 from "secp256k1";

export async function insertPoint(data: IPoint[]) {
  try {
    const step = 400;
    for(let i = 0; i < data.length; i = i + step) {
      const subData = data.slice(i, i + step)
      const sigObj = secp256k1.ecdsaSign(
        Buffer.from(
          crypto.createHash("sha256").update(JSON.stringify(subData)).digest().toString("hex"),
          "hex"
        ),
        Buffer.from(process.env.SAVE_POINT_PRIVATE_KEY, "hex")
      );
      await axios.post(process.env.SAVE_POINT_ENDPOINT, { data: subData, signature: Buffer.from(sigObj.signature).toString("hex") })
    }
    
  } catch (error) {
    console.error(`save point error : ${error}`)
  }
}

export const checkSnapshotAtDate = async (date: Date) => {
  const doc = await snapshotSchema.findOne({
    type: TYPE.DUAL_CORE_SNAPSHOT,
    time: date,
  })
  return Boolean(doc)
}
