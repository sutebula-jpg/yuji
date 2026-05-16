import "../config.js";
import axios from "axios";
import customizeQR from "./qrtemplate.js";

async function createQr(nominal, ref_id) {
  try {
    const data = {
      order_id: ref_id,
      project: global.pakasir_project,
      api_key: global.pakasir_apikey,
      amount: nominal
    };

    const response = await axios.post('https://app.pakasir.com/api/transactioncreate/qris', data);
    const result = response.data;

    if (result && result.payment && result.payment.payment_number) {
      const qrString = result.payment.payment_number;
      const qrisImage = await customizeQR(qrString);
      return qrisImage;
    } else {
      return null;
    }
  } catch (e) {
    return null;
  }
}

async function cekTransaksi(nominal, ref_id) {
  try {
    const url = `https://app.pakasir.com/api/transactiondetail?project=${global.pakasir_project}&amount=${nominal}&order_id=${ref_id}&api_key=${global.pakasir_apikey}`;
    const response = await axios.get(url);
    const result = response.data;

    if (result && result.transaction) {
      const status = result.transaction.status;
      if (status === 'completed') return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

export { createQr, cekTransaksi };
