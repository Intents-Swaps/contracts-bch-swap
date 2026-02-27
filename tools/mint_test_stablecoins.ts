import { TestNetWallet, Config } from 'mainnet-js';
import * as fs from 'fs';

// Force Chipnet network
Config.EnforceCashScript = false;
Config.DefaultNetwork = "chipnet";

const WALLET_FILE = 'wallet.json';

async function main() {
    console.log("Starting CashToken Minting Process on Chipnet...");

    // 1. Load wallet if exists, otherwise exit
    if (!fs.existsSync(WALLET_FILE)) {
        console.error("❌ wallet.json not found! Please run `npx tsx tools/setup_wallet.ts` first and fetch some tBCH from a faucet.");
        return;
    }

    const data = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
    if (!data.wif || data.wif === "UNKNOWN") {
        console.error("❌ Invalid WIF in wallet.json.");
        return;
    }

    const wallet = await TestNetWallet.fromWIF(data.wif);
    const balance = await wallet.getBalance('sat');
    console.log(`Wallet Address: ${wallet.cashaddr}`);
    console.log(`Wallet Balance: ${balance} sats`);

    if (balance < 10000n) {
        console.error("❌ Wallet balance is too low to mint tokens. Please get more tBCH from a Chipnet faucet.");
        return;
    }

    // 2. Prepare UTXOs
    // mainnet-js requires a UTXO with vout=0 to act as the token genesis identifier.
    // To guarantee we have one, we will simply send 20,000 sats to ourselves.
    console.log("\nPreparing vout=0 UTXO for Genesis...");
    await wallet.send([{ cashaddr: wallet.cashaddr as string, value: 20000, unit: 'sat' }]);
    await new Promise(r => setTimeout(r, 2000));

    // 3. Mint Mock MUSD
    // For pure token genesis (creating completely new Category IDs), we use tokenGenesis
    console.log("\nMinting Mock MUSD...");
    const musdResponse = await wallet.tokenGenesis({
        amount: 1000000n,
        cashtokens: {
            capability: "none",
            commitment: ""
        }
    });

    // In BCH, the Category ID is exactly the Genesis TXID
    const musdTokenId = musdResponse.txId;
    console.log(`✅ Success! Mock MUSD Category ID: ${musdTokenId}`);

    // Wait for the TX to broadcast and prepare another vout=0 for the second token
    await new Promise(r => setTimeout(r, 2000));
    console.log("Preparing second vout=0 UTXO...");
    await wallet.send([{ cashaddr: wallet.cashaddr as string, value: 20000, unit: 'sat' }]);
    await new Promise(r => setTimeout(r, 2000));

    // 4. Mint Mock PUSD
    console.log("\nMinting Mock PUSD...");
    const pusdResponse = await wallet.tokenGenesis({
        amount: 1000000n,
        cashtokens: {
            capability: "none",
            commitment: ""
        }
    });

    const pusdTokenId = pusdResponse.txId;
    console.log(`✅ Success! Mock PUSD Category ID: ${pusdTokenId}`);

    // 4. Save the Token IDs for the front-end / SDK
    const tokensFile = 'chipnet_test_tokens.json';
    const tokensData = {
        MUSD: musdTokenId,
        PUSD: pusdTokenId
    };

    fs.writeFileSync(tokensFile, JSON.stringify(tokensData, null, 2));
    console.log(`\n💾 Saved Token IDs to ${tokensFile}`);
    console.log("\nYou can now plug these generic 32-byte Category IDs into your Intents Swap logic to simulate cross-chain stablecoin swaps!");
}

main().catch(console.error);
