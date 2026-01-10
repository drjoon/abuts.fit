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
      materialType: {
        type: String,
        trim: true,
        default: "",
      },
      heatNo: {
        type: String,
        trim: true,
        default: "",
      },
      diameter: {
        type: Number,
        required: true,
      },
      diameterGroup: {
        type: String,
        enum: ["6", "8", "10", "10+"],
        required: true,
      },
      remainingLength: {
        type: Number,
        default: 0,
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
    dummySettings: {
      programName: {
        type: String,
        trim: true,
        default: "O0100",
      },
      schedules: [
        {
          time: {
            type: String,
            default: "08:00",
          },
          enabled: {
            type: Boolean,
            default: true,
          },
        },
      ],
      excludeHolidays: {
        type: Boolean,
        default: false,
      },
      // 마지막 더미 실행 시각(YYYY-MM-DD HH:mm, KST 기준)
      lastRunKey: {
        type: String,
        default: null,
      },
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
