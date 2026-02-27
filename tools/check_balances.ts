// @ts-nocheck
import { TestNetWallet, Config } from 'mainnet-js';
import * as fs from 'fs';

Config.EnforceCashScript = false;
Config.DefaultNetwork = "chipnet";

const WALLET_FILE = 'wallet.json';
const TOKENS_FILE = 'chipnet_test_tokens.json';

async function main() {
    try {
        const walletData = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
        const tokensData = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));

        const wallet = await TestNetWallet.fromWIF(walletData.wif);
        console.log(`Address: ${wallet.cashaddr}`);
        const bal = await wallet.getBalance('bch');
        console.log(`BCH Balance: ${bal}`);

        const utxos = await wallet.getTokenUtxos();
        console.log(`\n--- ALL UTXO TOKENS ---`);

        let musd = 0n;
        let pusd = 0n;

        for (const u of utxos) {
            // mainnet-js v1 Token format: token.amount, token.category
            const tokenId = u.token?.category || u.token?.tokenId || u.tokenId;
            const amount = u.token?.amount || u.tokenAmount;

            console.log(`UTXO Token ID: ${tokenId} | Amount: ${amount}`);

            if (tokenId === tokensData.MUSD) {
                musd += BigInt(amount || 0);
            } else if (tokenId === tokensData.PUSD) {
                pusd += BigInt(amount || 0);
            }
        }

        console.log(`\n--- TOKEN BALANCES ---`);
        console.log(`MUSD (${tokensData.MUSD}): ${musd}`);
        console.log(`PUSD (${tokensData.PUSD}): ${pusd}`);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
