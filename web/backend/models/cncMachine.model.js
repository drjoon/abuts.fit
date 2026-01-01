import mongoose from "mongoose";

const cncMachineSchema = new mongoose.Schema(
  {
    machineId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "maintenance", "inactive"],
      default: "active",
    },
    currentMaterial: {
      diameter: {
        type: Number,
        required: true,
      },
      diameterGroup: {
        type: String,
        enum: ["6", "8", "10", "10+"],
        required: true,
      },
      setAt: Date,
      setBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    scheduledMaterialChange: {
      targetTime: Date,
      newDiameter: Number,
      newDiameterGroup: {
        type: String,
        enum: ["6", "8", "10", "10+"],
      },
      scheduledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      scheduledAt: Date,
      notes: String,
    },
    specifications: {
      maxDiameter: Number,
      minDiameter: Number,
      manufacturer: String,
      model: String,
    },
    location: String,
    notes: String,
  },
  {
    timestamps: true,
  }
);

cncMachineSchema.index({ machineId: 1 });
cncMachineSchema.index({ status: 1 });
cncMachineSchema.index({ "currentMaterial.diameterGroup": 1 });

const CncMachine = mongoose.model("CncMachine", cncMachineSchema);

export default CncMachine;
