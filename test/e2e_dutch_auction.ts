import {
    Contract,
    ElectrumNetworkProvider,
    SignatureTemplate,
} from 'cashscript';
import { TestNetWallet, Config } from 'mainnet-js';
import * as fs from 'fs';
import * as path from 'path';

// Force Chipnet
(Config as any).EnforceCashScript = false;
(Config as any).DefaultNetwork = "chipnet";

const WALLET_FILE = 'wallet.json';
const TOKEN_DATA_FILE = 'token-data.json';
const ARTIFACT_FILE = path.resolve('artifacts/DutchAuctionSwap.json');

async function main() {
    console.log("=== Starting E2E Dutch Auction Test on Chipnet ===");
    console.log("DEBUG: VERSION 3 - WITH WALLET FUNDING");

    // 1. Load Wallet
    if (!fs.existsSync(WALLET_FILE)) {
        throw new Error("Wallet file not found. Run 'npm run setup-wallet' first.");
    }
    const walletData = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
    const wallet = await TestNetWallet.fromWIF(walletData.wif);
    const userAddr = (wallet as any).address || (wallet as any).cashaddr;
    const tokenAddr = (wallet as any).tokenaddr;
    console.log(`User Wallet: ${userAddr}`);
    console.log(`Token Address: ${tokenAddr}`);

    // 2. Load Token Data
    if (!fs.existsSync(TOKEN_DATA_FILE)) {
        throw new Error("Token data not found. Run 'npm run mint-musd' first.");
    }
    const tokenData = JSON.parse(fs.readFileSync(TOKEN_DATA_FILE, 'utf8'));
    const categoryId = tokenData.musd;
    console.log(`Token Category: ${categoryId}`);

    // 3. Load Artifact
    console.log("Loading DutchAuctionSwap artifact...");
    if (!fs.existsSync(ARTIFACT_FILE)) {
        throw new Error(`Artifact not found at ${ARTIFACT_FILE}. Run 'npm run build' first.`);
    }
    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_FILE, 'utf8'));

    // 4. Initialize Contract
    const makerPkh = await (wallet as any).getPublicKeyHash();

    const sellTokenCategory = `0x${categoryId}`;
    const buyTokenCategory = '0x'; // Native BCH
    const sellAmount = 1000n;

    const startBuyAmount = 5000n;
    const endBuyAmount = 1000n;
    const duration = 600n;
    const startTime = BigInt(Math.floor(Date.now() / 1000)); // Now

    const provider = new ElectrumNetworkProvider('chipnet');

    const contract = new Contract(artifact, [
        makerPkh,
        sellTokenCategory,
        buyTokenCategory,
        sellAmount,
        startBuyAmount,
        endBuyAmount,
        startTime,
        duration
    ], { provider });

    console.log(`Contract Address: ${contract.address}`);
    console.log(`Contract Size: ${contract.bytesize} bytes`);
    console.log(`Contract Opcount: ${contract.opcount} ops`);

    // 5. Fund the Contract (Lock 1000 MUSD)
    console.log("\n--- Funding Contract ---");
    const fundAmount = 1000n; // 1000 tokens

    try {
        const balance = await wallet.getBalance('sat');
        if (balance < 10000) { // Need more for fees and swap
            throw new Error(`Insufficient BCH balance (${balance}). Need ~10000.`);
        }

        // Check if contract already funded to avoid wasting tokens?
        // For E2E test, we assume fresh run or we just fund again.
        // But verify if we have tokens.

        const { txId } = await wallet.send([
            {
                cashaddr: contract.address,
                value: 1000,
                unit: 'sat',
                token: {
                    category: categoryId,
                    amount: fundAmount
                }
            }
        ] as any);
        console.log(`Funded! TXID: ${txId}`);
        console.log(`Waiting for confirmation/indexing...`);
        await new Promise(r => setTimeout(r, 5000)); // Wait 5s
    } catch (e) {
        console.error("Funding failed:", e);
        return;
    }

    // 6. Fill the Order
    console.log("\n--- Attempting Fill (Self-Swap) ---");
    const resolverPk = await wallet.getPublicKey();

    // Get Contract UTXOs
    const contractUtxos = await contract.getUtxos();
    if (contractUtxos.length === 0) {
        console.error("No UTXOs found on contract. Funding might have failed or not indexed.");
        return;
    }
    console.log(`Found ${contractUtxos.length} contract UTXOs.`);

    // Manually inject token data if missing (due to indexing lag)
    // We assume the first UTXO is the one we just sent if it has 1000 sats
    const utxo = contractUtxos[0];
    if (!utxo.token && utxo.satoshis === 1000n) {
        console.log("Injecting token data manually...");
        utxo.token = {
            amount: fundAmount,
            category: categoryId
        };
    }

    console.log("Using UTXO:", JSON.stringify(utxo, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

    // Get Wallet UTXOs for paying price + fees
    console.log("Fetching wallet UTXOs...");
    const walletUtxosMainnet = await wallet.getUtxos();
    const walletUtxos = walletUtxosMainnet.map((u: any) => ({
        txid: u.txid,
        vout: u.vout,
        satoshis: BigInt(u.satoshis),
        // We don't need token info for wallet inputs unless we are spending tokens
        // But we are spending BCH.
    }));
    console.log(`Found ${walletUtxos.length} wallet UTXOs.`);

    try {
        const signature = new SignatureTemplate(wallet.privateKey);

        const tx = await contract.functions
            .fill(resolverPk, signature)
            .to(userAddr, 5000n) // Output 0: Pay Maker (wallet) 5000 sats (Price)
            .to(tokenAddr, 1000n, { // Output 1: Pay Resolver tokens
                amount: fundAmount,
                category: categoryId
            })
            .withHardcodedFee(2000n)
            .from(contractUtxos)
            .fromP2PKH(walletUtxos, signature) // Add wallet inputs!
            .send();

        console.log(`\n✅ Swap Complete!`);
        console.log(`Transaction ID: ${tx.txid}`);
        console.log(`Explorer: https://chipnet.chaingraph.cash/tx/${tx.txid}`);

    } catch (e) {
        console.error("Swap failed:", e);
        if ((e as any).message) console.error("Error Message:", (e as any).message);
        const logs = (e as any).logs;
        if (logs) {
            console.error("Debug Logs:", logs);
        }
    }
}

main().catch(console.error);
