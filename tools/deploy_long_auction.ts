import { Contract, ElectrumNetworkProvider } from 'cashscript';
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
    console.log("=== Deploying Long-Duration Dutch Auction ===");

    if (!fs.existsSync(WALLET_FILE)) throw new Error("Wallet not found");
    const walletData = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
    const wallet = await TestNetWallet.fromWIF(walletData.wif);

    // Use cashaddr property which we saw in Object.keys
    const walletAddr = (wallet as any).cashaddr;
    console.log(`Wallet Address: ${walletAddr}`);

    if (!walletAddr) throw new Error("Wallet address is undefined!");

    if (!fs.existsSync(TOKEN_DATA_FILE)) throw new Error("Token data not found");
    let tokenData = JSON.parse(fs.readFileSync(TOKEN_DATA_FILE, 'utf8'));
    let categoryId = tokenData.musd;

    // Check balance first
    console.log(`Checking token balance for ${categoryId}...`);
    const utxos = await wallet.getTokenUtxos(categoryId);
    const bal = utxos.reduce((acc, u) => acc + (u.token?.amount || 0n), 0n);

    if (bal < 1000n) {
        console.log("Insufficient tokens. Minting NEW tokens...");

        // Helper to mint
        const doMint = async () => {
            return await wallet.tokenMint({
                cashaddr: walletAddr,
                amount: 10000n,
                category: categoryId,
            }).catch(async () => {
                console.log("Minting failed (no baton?). Creating NEW GENESIS...");
                const bchBal = await wallet.getBalance('sat');
                console.log(`BCH Balance: ${bchBal}`);

                try {
                    return await wallet.tokenGenesis({
                        amount: 10000n,
                        cashaddr: walletAddr,
                    });
                } catch (e: any) {
                    if (e.message && e.message.includes("vout=0")) {
                        console.log("No vout=0 UTXO. Sending self-transaction to create one...");
                        // Send to self to create fresh UTXOs
                        await wallet.send([{ cashaddr: walletAddr, value: 5000, unit: 'sat' }]);
                        console.log("Self-transaction sent. Retrying genesis...");
                        return await wallet.tokenGenesis({
                            amount: 10000n,
                            cashaddr: walletAddr,
                        });
                    }
                    throw e;
                }
            });
        };

        const genesisResponse = await doMint();

        // Fix: Use categories[0] as per logs
        let newCat = (genesisResponse as any).categories?.[0];

        if (!newCat && (genesisResponse as any).tokenIds?.[0]) {
            newCat = (genesisResponse as any).tokenIds?.[0];
        }

        // Fallback or keep old if minting succeeded with old cat
        if (!newCat && (genesisResponse as any).txId) {
            // Only use txId if we are certain it's a genesis, but categories should be present
            // newCat = (genesisResponse as any).txId; 
        }

        newCat = newCat || categoryId;

        console.log(`Genesis/Mint Result:`, genesisResponse);
        console.log(`Derived New Category: ${newCat}`);

        if (newCat !== categoryId) {
            console.log(`Switching to New Token Category: ${newCat}`);
            categoryId = newCat;
        }

        // Wait a bit for indexing?
        await new Promise(r => setTimeout(r, 2000));
    } else {
        console.log(`Balance: ${bal} (Sufficient)`);
    }

    if (!fs.existsSync(ARTIFACT_FILE)) throw new Error("Artifact not found");
    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_FILE, 'utf8'));

    // Check balance AGAIN because we might have switched categoryId
    // Wait for tokens to be available
    console.log(`Waiting for tokens (Category: ${categoryId})...`);
    let retries = 60; // 2 minutes
    while (retries > 0) {
        // Force refresh?
        await wallet.getUtxos();
        const utxos = await wallet.getTokenUtxos(categoryId);
        const bal = utxos.reduce((acc, u) => acc + (u.token?.amount || 0n), 0n);
        if (bal >= 1000n) {
            console.log(`Confirmed balance: ${bal}. Proceeding...`);
            break;
        }
        console.log(`Waiting for tokens... Balance: ${bal}, Retries: ${retries}`);
        await new Promise(r => setTimeout(r, 2000));
        retries--;
    }

    const makerPkh = await (wallet as any).getPublicKeyHash();
    const sellTokenCategory = `0x${categoryId}`;
    const buyTokenCategory = '0x';
    const sellAmount = 1000n;

    const startBuyAmount = 5000n;
    const endBuyAmount = 1000n;
    const duration = 7200n; // 2 Hours
    const startTime = BigInt(Math.floor(Date.now() / 1000));

    const provider = new ElectrumNetworkProvider('chipnet');

    const reverseHex = (hex: string) => hex.match(/.{2}/g)!.reverse().join('');

    // Note: We reverse the category ID for the contract so that it matches
    // the wire format (Little Endian) which CashScript introspection returns.
    // However, we keep 'sellTokenCategory' variable as Big Endian for external tools.
    const contract = new Contract(artifact, [
        makerPkh,
        `0x${reverseHex(categoryId)}`,
        buyTokenCategory,
        sellAmount,
        startBuyAmount,
        endBuyAmount,
        startTime,
        duration
    ], { provider });

    console.log(`Contract Address: ${contract.address}`);
    console.log(`\nCopy this address to .env WATCH_ADDRESSES!`);

    const params = {
        address: contract.address,
        makerPkh: makerPkh,
        sellTokenCategory: sellTokenCategory,
        buyTokenCategory: buyTokenCategory,
        sellAmount: sellAmount.toString(),
        startBuyAmount: startBuyAmount.toString(),
        endBuyAmount: endBuyAmount.toString(),
        startTime: startTime.toString(),
        duration: duration.toString()
    };
    console.log("PARAMS JSON:", JSON.stringify(params, null, 2));

    // Fund it
    console.log("Funding contract with 1000 MUSD + Dust...");

    // Send using Flat TokenSendRequest (v3)
    const tx = await wallet.send([
        {
            cashaddr: contract.address,
            value: 1000n, // sats
            category: categoryId,
            amount: sellAmount // token amount
        }
    ] as any);
    console.log(`Funded! TXID: ${tx.txId}`);
}

main().catch(console.error);
