// @ts-nocheck
import { TestNetWallet, Config } from 'mainnet-js';
import * as fs from 'fs';

Config.EnforceCashScript = false;
Config.DefaultNetwork = "chipnet";

const WALLET_FILE = 'wallet.json';

async function main() {
    try {
        console.log("=== Minting Fresh MUSD & PUSD Directly to Web Wallet ===\n");

        if (!fs.existsSync(WALLET_FILE)) {
            console.error("❌ wallet.json not found.");
            process.exit(1);
        }

        const walletData = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
        const wallet = await TestNetWallet.fromWIF(walletData.wif);
        console.log(`Source Wallet (from wallet.json): ${wallet.cashaddr}`);

        const bchBalance = await wallet.getBalance('bch');
        console.log(`BCH Balance: ${bchBalance} BCH`);

        if (bchBalance < 0.0001) {
            console.error("❌ Need some BCH for minting fees.");
            process.exit(1);
        }

        const dest = "bchtest:qqdqz4y3usqu65srvlkycsaawhd57zyknyrmy23jmc";
        console.log(`\nMinting directly to Web Wallet: ${dest}`);

        const amountToMint = 1000000n; // Use BigInt explicitly for mainnet-js

        // Prepare vout=0 to satisfy Genesis constraints
        console.log(`\nPreparing vout=0 UTXO for Genesis...`);
        await wallet.send([{ cashaddr: wallet.cashaddr as string, value: 20000, unit: 'sat' }]);
        await new Promise(r => setTimeout(r, 6000));

        // Mint MUSD directly to the destination wallet
        console.log(`\nMinting ${amountToMint} MUSD...`);
        const musdResponse = await wallet.tokenGenesis({
            amount: amountToMint,
            cashaddr: dest,
            cashtokens: { capability: "none", commitment: "" } // Fungible
        });
        const musdTokenId = musdResponse.txId;
        console.log(`✅ MUSD Minted directly to your wallet!`);
        console.log(`   TXID: https://chipnet.imaginary.cash/tx/${musdResponse.txId}`);
        console.log(`   => MUSD TOKEN ID: ${musdTokenId}`);

        console.log(`\nWaiting a few seconds before second mint...`);
        await new Promise(r => setTimeout(r, 4000));

        console.log("Preparing second vout=0 UTXO...");
        await wallet.send([{ cashaddr: wallet.cashaddr as string, value: 20000, unit: 'sat' }]);
        await new Promise(r => setTimeout(r, 6000));

        // Mint PUSD directly to the destination wallet
        console.log(`\nMinting ${amountToMint} PUSD...`);
        const pusdResponse = await wallet.tokenGenesis({
            amount: amountToMint,
            cashaddr: dest,
            cashtokens: { capability: "none", commitment: "" } // Fungible
        });
        const pusdTokenId = pusdResponse.txId;
        console.log(`✅ PUSD Minted directly to your wallet!`);
        console.log(`   TXID: https://chipnet.imaginary.cash/tx/${pusdResponse.txId}`);
        console.log(`   => PUSD TOKEN ID: ${pusdTokenId}`);

        console.log(`\nSending a little bit of gas (1000000 sats) to ${dest}...`);
        const tx3 = await wallet.send([{
            cashaddr: dest,
            value: 1000000,
            unit: 'sat'
        }]);
        console.log(`✅ tBCH Sent! TXID: https://chipnet.imaginary.cash/tx/${tx3.txId || tx3.txid}`);

        console.log("\n🎉 Awesome! Your Web Wallet now holds the fresh test stablecoins!");
        console.log("\n=== Next Steps ===");
        console.log("1. Open https://chipnet.cauldron.quest/pool");
        console.log("2. Make sure your web/extension wallet is connected and holds the destination address above.");
        console.log(`3. To create a MUSD/BCH pool, select MUSD as one token (paste ID: ${musdTokenId}) and BCH as the other.`);
        console.log("4. Set the initial price and supply liquidity!");

    } catch (e) {
        console.error("\nCRITICAL SCRIPT ERROR:");
        console.error(e);
        process.exit(1);
    }
}

main();
