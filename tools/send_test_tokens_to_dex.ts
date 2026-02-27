// @ts-nocheck
import { TestNetWallet, Config, TokenSendRequest } from 'mainnet-js';
import * as fs from 'fs';

// Force Chipnet
Config.EnforceCashScript = false;
Config.DefaultNetwork = "chipnet";

const WALLET_FILE = 'wallet.json';
const TOKENS_FILE = 'chipnet_test_tokens.json';

async function main() {
    try {
        console.log("=== Transfer TestTokens to Web Wallet for Pool Creation ===\n");

        if (!fs.existsSync(WALLET_FILE) || !fs.existsSync(TOKENS_FILE)) {
            console.error("❌ wallet.json or chipnet_test_tokens.json not found.");
            process.exit(1);
        }

        const walletData = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
        const tokensData = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));

        if (!walletData.wif) {
            console.error("❌ No WIF found in wallet.json");
            process.exit(1);
        }

        const wallet = await TestNetWallet.fromWIF(walletData.wif);
        console.log(`Source Wallet (from wallet.json): ${wallet.cashaddr}`);

        // Check balances
        const bchBalance = await wallet.getBalance('bch');
        console.log(`BCH Balance: ${bchBalance} BCH`);

        const dest = "bchtest:qqdqz4y3usqu65srvlkycsaawhd57zyknyrmy23jmc";
        console.log(`\nDestination Web Wallet: ${dest}`);

        const amountToSend = 500000; // Sending half of the minted amount (1M minted)

        console.log(`\nSending ${amountToSend} MUSD to ${dest}...`);
        const tx1 = await wallet.send([
            new TokenSendRequest({
                cashaddr: dest,
                tokenId: tokensData.MUSD,
                amount: amountToSend
            })
        ]);
        console.log(`✅ MUSD Sent! TXID: https://chipnet.imaginary.cash/tx/${tx1.txId || tx1.txid}`);

        console.log(`\nSending ${amountToSend} PUSD to ${dest}...`);
        const tx2 = await wallet.send([
            new TokenSendRequest({
                cashaddr: dest,
                tokenId: tokensData.PUSD,
                amount: amountToSend
            })
        ]);
        console.log(`✅ PUSD Sent! TXID: https://chipnet.imaginary.cash/tx/${tx2.txId || tx2.txid}`);

        console.log(`\nSending a little bit of gas (0.01 tBCH) to ${dest}...`);
        const tx3 = await wallet.send([{
            cashaddr: dest,
            value: 0.01,
            unit: 'bch'
        }]);
        console.log(`✅ tBCH Sent! TXID: https://chipnet.imaginary.cash/tx/${tx3.txId || tx3.txid}`);

        console.log("\n🎉 All Transfers Complete!");
        console.log("\n=== Next Steps ===");
        console.log("1. Open https://chipnet.cauldron.quest/pool");
        console.log("2. Make sure your web/extension wallet is connected and holds the destination address above.");
        console.log(`3. To create a MUSD/BCH pool, select MUSD as one token (paste ID: ${tokensData.MUSD}) and BCH as the other.`);
        console.log("4. Set the initial price and supply liquidity!");

    } catch (e) {
        console.error("\nCRITICAL SCRIPT ERROR:");
        console.error(e);
        process.exit(1);
    }
}

main();
