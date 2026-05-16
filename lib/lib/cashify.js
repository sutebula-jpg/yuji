import "../config.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import customizeQR from "./qrtemplate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TX_FILE = path.join(__dirname, "../src/cashify_tx.json");

const BASE_URL = "https://cashify.my.id/api/generate";

// Persistent txMap: ref_id -> { transactionId, totalAmount }
function loadTxMap() {
  try {
    if (fs.existsSync(TX_FILE)) {
      return new Map(Object.entries(JSON.parse(fs.readFileSync(TX_FILE, "utf-8"))));
    }
  } catch {}
  return new Map();
}

function saveTxMap(map) {
  try {
    fs.writeFileSync(TX_FILE, JSON.stringify(Object.fromEntries(map), null, 2));
  } catch {}
}

const txMap = loadTxMap();

async function createQr(nominal, ref_id) {
  try {
    const response = await axios.post(`${BASE_URL}/qris`, {
      id: global.cashify_qris_id,
      amount: parseInt(nominal),
      useUniqueCode: true,
      packageIds: global.cashify_package_ids || ["id.dana"],
      expiredInMinutes: 15,
    }, {
      headers: { "x-license-key": global.cashify_license_key }
    });

    const result = response.data;
    if (result && result.status === 200 && result.data) {
      const { qr_string, transactionId, totalAmount } = result.data;
      if (!qr_string) {
        console.error("[Cashify] qr_string kosong:", result.data);
        return null;
      }
      txMap.set(ref_id, { transactionId, totalAmount });
      saveTxMap(txMap);
      const qrisImage = await customizeQR(qr_string);
      return qrisImage;
    }
    console.error("[Cashify] Error:", result?.message || "Response tidak valid");
    return null;
  } catch (e) {
    const errMsg = e.response?.data?.message || e.message;
    console.error("[Cashify] createQr error:", errMsg);
    return null;
  }
}

async function cekTransaksi(nominal, ref_id) {
  try {
    const tx = txMap.get(ref_id);
    console.log(`[Cashify] cekTransaksi ref_id=${ref_id}, txMap has=${txMap.has(ref_id)}, tx=`, tx);
    if (!tx) {
      console.error(`[Cashify] txMap tidak punya ref_id: ${ref_id}. Keys:`, [...txMap.keys()]);
      return false;
    }

    const response = await axios.post(`${BASE_URL}/check-status`, {
      transactionId: tx.transactionId,
    }, {
      headers: { "x-license-key": global.cashify_license_key }
    });

    const result = response.data;
    console.log(`[Cashify] check-status response:`, JSON.stringify(result));
    if (result && result.data) {
      const status = result.data.status?.toLowerCase();
      if (status === "paid" || status === "success") {
        txMap.delete(ref_id);
        saveTxMap(txMap);
        return true;
      }
    }

    const listResponse = await axios.get(`${BASE_URL}/list?sort=newest&limit=20`, {
      headers: { "x-license-key": global.cashify_license_key }
    });
    const payments = listResponse.data?.data?.items || [];
    const paidPayment = payments.find((payment) => {
      const paymentStatus = payment.status?.toLowerCase();
      return Number(payment.amount) === Number(nominal) && (paymentStatus === "paid" || paymentStatus === "success");
    });
    console.log(`[Cashify] fallback list match:`, paidPayment || null);
    if (paidPayment) {
      txMap.delete(ref_id);
      saveTxMap(txMap);
      return true;
    }
    return false;
  } catch (e) {
    console.error("[Cashify] cekTransaksi error:", e.response?.data || e.message);
    return false;
  }
}

export { createQr, cekTransaksi };
