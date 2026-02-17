import { TestNetWallet, Config } from 'mainnet-js';
import * as QRCode from 'qrcode';
import * as fs from 'fs';

// Force Chipnet network
Config.EnforceCashScript = false;
Config.DefaultNetwork = "chipnet";

const WALLET_FILE = 'wallet.json';

async function main() {
    let wallet;

    if (fs.existsSync(WALLET_FILE)) {
        const data = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
        if (data.wif && data.wif !== "UNKNOWN") {
            wallet = await TestNetWallet.fromWIF(data.wif);
        } else {
            wallet = await TestNetWallet.newRandom();
        }
    } else {
        try {
            wallet = await TestNetWallet.newRandom();
        } catch (e) {
            console.error("Error creating random wallet:", e);
            return;
        }

        // Save wallet details
        const anyWallet = wallet as any;
        const wif = anyWallet.privateKeyWif || anyWallet.wif;
        const addr = anyWallet.cashaddr || wallet.address;

        const data = {
            address: addr,
            wif: wif,
            derivationPath: wallet.derivationPath
        };
        fs.writeFileSync(WALLET_FILE, JSON.stringify(data, null, 2));
        console.log(`✅ New wallet created and saved to ${WALLET_FILE}`);
    }

    console.log('\n=== BCH Chipnet Wallet ===');
    const addr = (wallet as any).cashaddr || wallet.address;
    console.log(`Address: ${addr}`);

    const savedData = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
    console.log(`WIF:     ${savedData.wif}`);

    const balance = await wallet.getBalance('sat');
    console.log(`Balance: ${balance} satoshis`);

    if (balance == 0 || balance == 0n) {
        console.log('\n⚠️  Wallet is empty! You need tBCH to run tests.');
        console.log('Please fund it using a Chipnet faucet:');
        console.log('1. https://tbch.googol.cash/');
        console.log('2. https://faucet.chipnet.app/');
        console.log(`\nAddress to fund: ${addr}`);

        try {
            const qr = await QRCode.toString(addr, { type: 'terminal', small: true });
            console.log('\nScan to Fund:');
            console.log(qr);
        } catch (e) {
            console.log('Could not generate QR code:', e);
        }
    } else {
        console.log('\n✅ Wallet is funded! You can now run the minting script.');
    }
}

main().catch(console.error);
