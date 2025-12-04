import mongoose from "mongoose";
import { config } from "dotenv";
import Connection from "../models/connection.model.js";

config();

const mongoUri =
  process.env.MONGODB_URI_TEST || "mongodb://localhost:27017/abutsFit";

const seedData = [
  // 한화prc - Connection
  {
    manufacturer: "NEOBIOTECH",
    system: "Regular",
    type: "Hex",
    category: "hanhwa-connection",
    fileName: "네오_R_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "NEOBIOTECH",
    system: "Regular",
    type: "Non-Hex",
    category: "hanhwa-connection",
    fileName: "네오_R_Non_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "DENTIS",
    system: "Mini",
    type: "Hex",
    category: "hanhwa-connection",
    fileName: "덴티스_M_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "DENTIS",
    system: "Mini",
    type: "Non-Hex",
    category: "hanhwa-connection",
    fileName: "덴티스_M_Non_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "DENTIS",
    system: "Regular",
    type: "Hex",
    category: "hanhwa-connection",
    fileName: "덴티스_R_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "DENTIS",
    system: "Regular",
    type: "Non-Hex",
    category: "hanhwa-connection",
    fileName: "덴티스_R_Non_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "DENTIUM",
    system: "Regular",
    type: "Hex",
    category: "hanhwa-connection",
    fileName: "덴티움_R_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "DENTIUM",
    system: "Regular",
    type: "Non-Hex",
    category: "hanhwa-connection",
    fileName: "덴티움_R_Non_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "DIO",
    system: "Mini",
    type: "Hex",
    category: "hanhwa-connection",
    fileName: "디오_M_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "DIO",
    system: "Mini",
    type: "Non-Hex",
    category: "hanhwa-connection",
    fileName: "디오_M_Non_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "DIO",
    system: "Regular",
    type: "Hex",
    category: "hanhwa-connection",
    fileName: "디오_R_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "DIO",
    system: "Regular",
    type: "Non-Hex",
    category: "hanhwa-connection",
    fileName: "디오_R_Non_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "MEGAGEN",
    system: "AnyRidge",
    type: "Hex",
    category: "hanhwa-connection",
    fileName: "애니릿지_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "MEGAGEN",
    system: "AnyRidge",
    type: "Non-Hex",
    category: "hanhwa-connection",
    fileName: "애니릿지_Non_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "MEGAGEN",
    system: "AnyOne Regular",
    type: "Hex",
    category: "hanhwa-connection",
    fileName: "애니원R_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "MEGAGEN",
    system: "AnyOne Regular",
    type: "Non-Hex",
    category: "hanhwa-connection",
    fileName: "애니원R_Non_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "OSSTEM",
    system: "KS System",
    type: "Hex",
    category: "hanhwa-connection",
    fileName: "오스템_KS_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "OSSTEM",
    system: "KS System",
    type: "Non-Hex",
    category: "hanhwa-connection",
    fileName: "오스템_KS_Non_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "OSSTEM",
    system: "Mini",
    type: "Hex",
    category: "hanhwa-connection",
    fileName: "오스템_M_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "OSSTEM",
    system: "Mini",
    type: "Non-Hex",
    category: "hanhwa-connection",
    fileName: "오스템_M_Non_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "OSSTEM",
    system: "Regular",
    type: "Hex",
    category: "hanhwa-connection",
    fileName: "오스템_R_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "OSSTEM",
    system: "Regular",
    type: "Non-Hex",
    category: "hanhwa-connection",
    fileName: "오스템_R_Non_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "OSSTEM",
    system: "SSR",
    type: "Hex",
    category: "hanhwa-connection",
    fileName: "오스템_SSR_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "OSSTEM",
    system: "SSR",
    type: "Non-Hex",
    category: "hanhwa-connection",
    fileName: "오스템_SSR_Non_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "TOPPLAN",
    system: "Mini",
    type: "Hex",
    category: "hanhwa-connection",
    fileName: "탑플란_M_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "TOPPLAN",
    system: "Mini",
    type: "Non-Hex",
    category: "hanhwa-connection",
    fileName: "탑플란_M_Non_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "TOPPLAN",
    system: "Regular",
    type: "Hex",
    category: "hanhwa-connection",
    fileName: "탑플란_R_Connection.prc",
    isActive: true,
  },
  {
    manufacturer: "TOPPLAN",
    system: "Regular",
    type: "Non-Hex",
    category: "hanhwa-connection",
    fileName: "탑플란_R_Non_Connection.prc",
    isActive: true,
  },

  // 스타prc - Connection (향후 장비 확장 대비, 기본은 비활성으로 둠)
  {
    manufacturer: "DENTIS",
    system: "Standard",
    type: "Hex",
    category: "star-connection",
    fileName: "DENTIS_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "DENTIS",
    system: "Standard",
    type: "Non-Hex (NH)",
    category: "star-connection",
    fileName: "DENTIS_NH_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "DENTIUM",
    system: "Standard",
    type: "Hex",
    category: "star-connection",
    fileName: "DENTIUM_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "DENTIUM",
    system: "Standard",
    type: "Non-Hex (NH)",
    category: "star-connection",
    fileName: "DENTIUM_NH_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "DIO",
    system: "Standard",
    type: "Hex",
    category: "star-connection",
    fileName: "DIO_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "DIO",
    system: "Standard",
    type: "Non-Hex (NH)",
    category: "star-connection",
    fileName: "DIO_NH_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "DIO",
    system: "Narrow (Mini)",
    type: "Hex",
    category: "star-connection",
    fileName: "DIO_Narrow(Mini)_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "DIO",
    system: "Narrow (Mini)",
    type: "Non-Hex (NH)",
    category: "star-connection",
    fileName: "DIO_Narrow(Mini)_NH_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "MEGAGEN",
    system: "AnyOne",
    type: "Hex",
    category: "star-connection",
    fileName: "MEGAGEN_AnyOne_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "MEGAGEN",
    system: "AnyOne",
    type: "Non-Hex (NH)",
    category: "star-connection",
    fileName: "MEGAGEN_AnyOne_NH_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "MEGAGEN",
    system: "AnyRidge",
    type: "Hex",
    category: "star-connection",
    fileName: "MEGAGEN_AnyRidge_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "MEGAGEN",
    system: "AnyRidge",
    type: "Non-Hex (NH)",
    category: "star-connection",
    fileName: "MEGAGEN_AnyRidge_NH_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "Neobiotech",
    system: "Standard",
    type: "Hex",
    category: "star-connection",
    fileName: "Neobiotech_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "Neobiotech",
    system: "Standard",
    type: "Non-Hex (NH)",
    category: "star-connection",
    fileName: "Neobiotech_NH_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "OSSTEM",
    system: "Mini",
    type: "Hex",
    category: "star-connection",
    fileName: "OSSTEM_Mini_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "OSSTEM",
    system: "Mini",
    type: "Non-Hex (NH)",
    category: "star-connection",
    fileName: "OSSTEM_Mini_NH_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "OSSTEM",
    system: "Regular",
    type: "Hex",
    category: "star-connection",
    fileName: "OSSTEM_Regular_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "OSSTEM",
    system: "Regular",
    type: "Non-Hex (NH)",
    category: "star-connection",
    fileName: "OSSTEM_Regular_NH_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "STRAUMANN",
    system: "NC (Narrow)",
    type: "Hex",
    category: "star-connection",
    fileName: "STRAUMANN_NC_Connection.prc",
    isActive: false,
  },
  {
    manufacturer: "STRAUMANN",
    system: "RC (Regular)",
    type: "Hex",
    category: "star-connection",
    fileName: "STRAUMANN_RC_Connection.prc",
    isActive: false,
  },
];

async function run() {
  try {
    await mongoose.connect(mongoUri);
    console.log("MongoDB connected");

    for (const item of seedData) {
      await Connection.findOneAndUpdate(
        {
          manufacturer: item.manufacturer,
          system: item.system,
          type: item.type,
          category: item.category,
        },
        item,
        { upsert: true, new: true }
      );
    }

    console.log("Connection seed completed");
  } catch (err) {
    console.error("Seed error", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
