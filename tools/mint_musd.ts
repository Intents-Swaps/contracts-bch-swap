import { TestNetWallet, Config } from 'mainnet-js';
import * as fs from 'fs';

// Force Chipnet network
Config.EnforceCashScript = false;
Config.DefaultNetwork = "chipnet";

const WALLET_FILE = 'wallet.json';

async function main() {
    if (!fs.existsSync(WALLET_FILE)) {
        console.error(`Error: ${WALLET_FILE} not found. Run 'npm run setup-wallet' first.`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
    let wallet;
    try {
        if (data.wif && data.wif !== "UNKNOWN") {
            wallet = await TestNetWallet.fromWIF(data.wif);
        } else {
            console.error("Wallet WIF not found in wallet.json");
            return;
        }
    } catch (e) {
        console.error("Failed to load wallet:", e);
        return;
    }

    const addr = (wallet as any).cashaddr || wallet.address;
    console.log(`Loaded wallet: ${addr}`);

    const balance = await wallet.getBalance('sat');
    console.log(`Balance: ${balance} satoshis`);

    if (balance < 2000) {
        console.error("Error: Not enough BCH. Please fund the wallet with at least 2000 sats.");
        return;
    }

    console.log("Minting MUSD (Motion USD) test tokens...");

    try {
        // Use tokenGenesis for creating a NEW token category
        const response = await wallet.tokenGenesis({
            amount: 1000000n,            // 1 million units
            capability: "minting",       // Keep minting capability
            commitment: "00",            // Optional commitment
        });

        const tokenId = response.tokenIds?.[0] || (response as any).tokenId;
        console.log(`\n✅ MUSD Minted successfully!`);
        console.log(`Token ID (Category): ${tokenId}`);
        console.log(`Transaction ID:      ${response.txId}`);
        console.log(`Explorer:            https://chipnet.chaingraph.cash/tx/${response.txId}`);

        // Save Token ID to a file for other scripts
        fs.writeFileSync('token-data.json', JSON.stringify({ musd: tokenId }, null, 2));
        console.log(`Token data saved to token-data.json`);

    } catch (e) {
        console.error("Minting failed:", e);
    }
}

main().catch(console.error);
