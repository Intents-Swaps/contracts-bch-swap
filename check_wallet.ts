import { TestNetWallet } from "mainnet-js";
async function run() {
    const wif = "cN4nUwGunYVjG2mKd1ERPXtKFbcu4P9gGBL6DJYMPSVrzqyk1VFv";
    const wallet = await TestNetWallet.fromWIF(wif);
    const balances = await wallet.getAllTokenBalances();
    console.log(JSON.stringify(balances, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}
run().catch(console.error);
