import { Util } from '../model/util.model'

export const getUtilData = async (key: string) => {
  try {
    const doc = await Util.findOne({
      key,
    })
    return doc.value
  } catch (error) {
    return '0'
  }
}

export const updateUtilData = (key: string, newValue: string) => {
  return Util.updateOne(
    {
      key,
    },
    {
      $set: {
        value: newValue,
      },
    },
    {
      upsert: true,
    }
  )
}
