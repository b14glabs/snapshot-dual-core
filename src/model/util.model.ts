import mongoose, { InferRawDocType } from "mongoose";

const schemaDefinition = {
  key: {
    type: String,
    required: true,
    unique: true,
  },
  value: {
    type: String,
    required: true,
  },
};

const schema = new mongoose.Schema(schemaDefinition, {
  timestamps: { createdAt: true, updatedAt: true },
  collection: "snapshot_point",
});

export const Util = mongoose.connection.useDb("b14g_stats").model("snapshot_point", schema);
export type IUtil = InferRawDocType<typeof schemaDefinition>;
