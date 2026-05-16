import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VOUCHER_FILE = path.join(__dirname, '../src/vouchers.json');

async function loadVouchers() {
    try {
        const data = await fs.readFile(VOUCHER_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        if (e.code === 'ENOENT') return [];
        console.error("Voucher Helper Load Error:", e);
        return [];
    }
}

async function saveVouchers(vouchers) {
    try {
        await fs.writeFile(VOUCHER_FILE, JSON.stringify(vouchers, null, 2), 'utf-8');
    } catch (e) {
        console.error("Voucher Helper Save Error:", e);
    }
}



export async function markVoucherUsed(code, userId) {
    const allVouchers = await loadVouchers();
    const voucherIndex = allVouchers.findIndex(v => v.code === code);
    
    if (voucherIndex === -1) {
        return { success: false, error: "Voucher not found in file." };
    }

    let voucher = allVouchers[voucherIndex];

    if (voucher.used) {
        return { success: true };
    }

    voucher.used = true;
    voucher.usedBy = userId;
    voucher.usedAt = new Date().toISOString();
    
    allVouchers[voucherIndex] = voucher;
    
    await saveVouchers(allVouchers);
    return { success: true };
}



export async function deleteVoucher(code) {
    const allVouchers = await loadVouchers();
    const index = allVouchers.findIndex(v => v.code === code);

    if (index === -1) {
        return { success: false, error: "Voucher tidak ditemukan." };
    }

    const voucher = allVouchers[index];

    if (voucher.used) {
        return { success: false, error: "Voucher sudah digunakan dan tidak bisa dihapus." };
    }

    allVouchers.splice(index, 1);
    await saveVouchers(allVouchers);

    return { success: true };
}

